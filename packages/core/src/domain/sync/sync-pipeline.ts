/* -------------------------------------------------------------------------- */
/*  Sync pipeline                                                              */
/*                                                                            */
/*  Consumes ScannedMediaItem[] from the scanners and walks them through a   */
/*  series of well-defined phases. Each phase is a small, side-effect-free   */
/*  function where possible; the orchestrator is the only place that talks   */
/*  to the database.                                                          */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import { persistMedia, getSupportedLanguageCodes } from "../use-cases/persist-media";
import { getSetting, getSettings, setSettingRaw } from "@canto/db/settings";

import { dispatchMediaPipeline } from "../../infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "../../lib/log-error";
import {
  findMediaByAnyReference,
  updateMedia,
  createMediaVersionEpisodes,
  deleteMediaVersionEpisodesByVersionId,
  addListItem,
  addToUserMediaLibrary,
  ensureServerLibrary,
  upsertMediaVersion,
  type MediaVersionInsert,
} from "../../infrastructure/repositories";
import { reconcileServerLibrary } from "../../infrastructure/repositories/list-repository";

import { resolveExternalId, tmdbCall } from "../use-cases/resolve-external-id";
import {
  fetchJellyfinMediaInfo,
  fetchPlexMediaInfo,
  type MediaFileInfo,
} from "../use-cases/fetch-server-media-info";

import type { ScannedMediaItem, SyncResult, SyncSummary } from "./types";
import { emptySummary } from "./types";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2_000;
const ITEM_DELAY_MS = 250;
const STATUS_KEY_PREFIX = "sync.mediaImport.status";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ServerConfig {
  jellyfinUrl: string | null | undefined;
  jellyfinKey: string | null | undefined;
  plexUrl: string | null | undefined;
  plexToken: string | null | undefined;
}

export interface SyncPipelineOptions {
  /** If set, sync output is also linked into this user's personal library. */
  forUserId?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistStatus(tag: string, summary: SyncSummary): Promise<void> {
  // Dynamic per-tag keys aren't in the registry — use the raw escape hatch.
  await setSettingRaw(`${STATUS_KEY_PREFIX}.${tag}`, summary);
}

/* -------------------------------------------------------------------------- */
/*  Phases                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Phase 1: keep only items that the scanner produced with a non-empty
 * serverItemId. Anything else is a scanner bug.
 */
export function validateScannedItems(
  items: ScannedMediaItem[],
  tag: string,
): ScannedMediaItem[] {
  return items.filter((item) => {
    if (!item.serverItemId) {
      console.warn(`[${tag}] Scanner emitted ${item.source} item with no serverItemId: ${item.title}`);
      return false;
    }
    return true;
  });
}

/**
 * Phase 2: dedupe within a single scan. We dedupe only within the same
 * source so cross-source items still produce distinct media_version rows.
 */
export function deduplicateScannedItems(
  items: ScannedMediaItem[],
): ScannedMediaItem[] {
  const seen = new Set<string>();
  const out: ScannedMediaItem[] = [];
  for (const item of items) {
    const key = `${item.source}:${item.serverItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Build the media_version insert row from a scanned item and (optionally) a
 * resolved anchor + quality metadata from the server.
 */
export function toMediaVersionInsert(
  scanned: ScannedMediaItem,
  extras: {
    mediaId?: string;
    tmdbId?: number;
    result: SyncResult;
    reason?: string | null;
    syncedAt: Date;
    quality?: MediaFileInfo;
  },
): MediaVersionInsert {
  const q = extras.quality;
  return {
    mediaId: extras.mediaId ?? null,
    source: scanned.source,
    serverLinkId: scanned.serverLinkId,
    serverItemId: scanned.serverItemId,
    serverItemTitle: scanned.title,
    serverItemPath: scanned.path ?? null,
    serverItemYear: scanned.year ?? null,
    resolution: q?.resolution ?? null,
    videoCodec: q?.videoCodec ?? null,
    audioCodec: q?.audioCodec ?? null,
    container: q?.container ?? null,
    fileSize: q?.fileSize ?? null,
    bitrate: q?.bitrate ?? null,
    durationMs: q?.durationMs ?? null,
    hdr: q?.hdr ?? null,
    primaryAudioLang: q?.primaryAudioLang ?? null,
    audioLangs: q?.audioLangs ?? null,
    subtitleLangs: q?.subtitleLangs ?? null,
    tmdbId: extras.tmdbId ?? scanned.externalIds.tmdb ?? null,
    result: extras.result,
    reason: extras.reason ?? null,
    syncedAt: extras.syncedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*  Media resolution + persistence                                             */
/* -------------------------------------------------------------------------- */

interface ResolvedMediaAnchor {
  mediaId: string;
  tmdbId: number;
  isNewImport: boolean;
}

/**
 * Ensure the media row exists in the DB. Three branches:
 *   1. In-memory cache hit → return it.
 *   2. DB lookup finds an existing media → flip `inLibrary`/`downloaded` if
 *      needed, dispatch metadata enrichment if missing.
 *   3. Brand new media → pull metadata from TMDB, persist, enrich.
 *
 * Returns null if external-id resolution itself fails.
 */
async function ensureMediaAnchor(
  db: Database,
  tmdb: MediaProviderPort,
  scanned: ScannedMediaItem,
  cache: Map<number, ResolvedMediaAnchor>,
  supportedLangs: readonly string[],
  tvdbEnabled: boolean,
): Promise<ResolvedMediaAnchor | null> {
  const resolved = await resolveExternalId(tmdb, {
    tmdbId: scanned.externalIds.tmdb,
    imdbId: scanned.externalIds.imdb,
    tvdbId: scanned.externalIds.tvdb,
    type: scanned.type,
  });
  if (!resolved) return null;

  const cached = cache.get(resolved.tmdbId);
  if (cached) {
    // Don't flip isNewImport for subsequent observations of the same tmdbId
    // in the same batch — only the first one counts as an import.
    return { ...cached, isNewImport: false };
  }

  const existing = await findMediaByAnyReference(
    db,
    resolved.tmdbId,
    "tmdb",
    scanned.externalIds.imdb,
    scanned.externalIds.tvdb,
  );

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (!existing.inLibrary) updates.inLibrary = true;
    if (!existing.downloaded) updates.downloaded = true;
    if (!existing.libraryId && scanned.libraryId) updates.libraryId = scanned.libraryId;
    if (!existing.libraryPath && scanned.path) updates.libraryPath = scanned.path;
    if (!existing.addedAt) updates.addedAt = new Date();
    if (Object.keys(updates).length > 0) {
      await updateMedia(db, existing.id, updates);
    }
    if (!existing.metadataUpdatedAt) {
      void dispatchMediaPipeline({ mediaId: existing.id }).catch(
        logAndSwallow("sync-pipeline dispatchMediaPipeline"),
      );
    }
    const anchor: ResolvedMediaAnchor = {
      mediaId: existing.id,
      tmdbId: resolved.tmdbId,
      isNewImport: !existing.inLibrary,
    };
    cache.set(resolved.tmdbId, anchor);
    return anchor;
  }

  // Brand new media: pull from TMDB
  const normalized = await tmdbCall(() =>
    tmdb.getMetadata(resolved.tmdbId, resolved.resolvedType, {
      supportedLanguages: supportedLangs as string[],
    }),
  );
  const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });
  const mediaUpdates: Record<string, unknown> = {
    inLibrary: true,
    downloaded: true,
    libraryPath: scanned.path,
    addedAt: new Date(),
  };
  if (scanned.libraryId) mediaUpdates.libraryId = scanned.libraryId;
  await updateMedia(db, inserted.id, mediaUpdates);
  void dispatchMediaPipeline({ mediaId: inserted.id }).catch(
    logAndSwallow("sync-pipeline dispatchMediaPipeline"),
  );

  const anchor: ResolvedMediaAnchor = {
    mediaId: inserted.id,
    tmdbId: resolved.tmdbId,
    isNewImport: true,
  };
  cache.set(resolved.tmdbId, anchor);
  return anchor;
}

/* -------------------------------------------------------------------------- */
/*  Episodes                                                                   */
/* -------------------------------------------------------------------------- */

async function fetchMediaFilesFor(
  scanned: ScannedMediaItem,
  config: ServerConfig,
): Promise<MediaFileInfo[]> {
  if (scanned.source === "jellyfin") {
    if (!config.jellyfinUrl || !config.jellyfinKey) return [];
    return fetchJellyfinMediaInfo(
      config.jellyfinUrl,
      config.jellyfinKey,
      scanned.serverItemId,
      scanned.type,
    );
  }
  if (!config.plexUrl || !config.plexToken) return [];
  return fetchPlexMediaInfo(config.plexUrl, config.plexToken, scanned.serverItemId, scanned.type);
}

/**
 * Pick the top-level MediaFileInfo to attach to the media_version row.
 * For movies there's exactly one entry; for shows we synthesize a header
 * by taking the first episode as a representative and leaving per-episode
 * quality to the media_version_episode children.
 */
function pickTopLevelFileInfo(
  files: MediaFileInfo[],
  type: "movie" | "show",
): MediaFileInfo | undefined {
  if (files.length === 0) return undefined;
  if (type === "movie") return files[0];
  const first = files[0];
  if (!first) return undefined;
  // For a show, the row-level quality columns summarize the first episode's
  // encoding — good enough for UI facets. Per-episode detail still lives in
  // media_version_episode.
  return first;
}

async function persistEpisodesFor(
  db: Database,
  versionId: string,
  files: MediaFileInfo[],
): Promise<void> {
  await deleteMediaVersionEpisodesByVersionId(db, versionId);
  const episodeFiles = files.filter(
    (f) => f.seasonNumber != null || f.episodeNumber != null,
  );
  if (episodeFiles.length === 0) return;
  await createMediaVersionEpisodes(
    db,
    episodeFiles.map((f) => ({
      versionId,
      seasonNumber: f.seasonNumber,
      episodeNumber: f.episodeNumber,
      serverEpisodeId: f.serverEpisodeId,
      resolution: f.resolution,
      videoCodec: f.videoCodec,
      audioCodec: f.audioCodec,
      container: f.container,
      fileSize: f.fileSize,
      bitrate: f.bitrate,
      durationMs: f.durationMs,
      hdr: f.hdr,
      primaryAudioLang: f.primaryAudioLang,
      audioLangs: f.audioLangs,
      subtitleLangs: f.subtitleLangs,
      filePath: f.filePath,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/*  Main use-case                                                              */
/* -------------------------------------------------------------------------- */

async function loadServerConfig(): Promise<ServerConfig> {
  const s = await getSettings([
    "jellyfin.url",
    "jellyfin.apiKey",
    "plex.url",
    "plex.token",
  ]);
  return {
    jellyfinUrl: s["jellyfin.url"],
    jellyfinKey: s["jellyfin.apiKey"],
    plexUrl: s["plex.url"],
    plexToken: s["plex.token"],
  };
}

/**
 * The sync pipeline entry point. Takes an already-scanned batch and runs
 * it through the validation → dedupe → resolve → persist → upsert phases.
 *
 * IMPORTANT: the pipeline deliberately does NOT prune or bump last-sync
 * timestamps at the server-link level — those are whole-library concerns
 * that belong to the caller (e.g. reverse-sync), which knows the full scan
 * result. Passing a filtered batch in here must not wipe siblings that
 * were skipped by a caller-side "recently synced" optimisation.
 */
export async function runSyncPipeline(
  db: Database,
  tmdb: MediaProviderPort,
  scannedItems: ScannedMediaItem[],
  tag: string,
  opts: SyncPipelineOptions = {},
): Promise<SyncSummary> {
  if (scannedItems.length === 0) {
    console.log(`[${tag}] No items to process`);
    const summary = emptySummary(0);
    summary.status = "completed";
    summary.completedAt = new Date().toISOString();
    await persistStatus(tag, summary);
    return summary;
  }

  const syncRunStart = new Date();
  const tvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
  const config = await loadServerConfig();
  const supportedLangs = [...(await getSupportedLanguageCodes(db))];

  // Phase 1 + 2 — validate + dedupe
  const validated = validateScannedItems(scannedItems, tag);
  const deduplicated = deduplicateScannedItems(validated);

  const summary = emptySummary(deduplicated.length);
  await persistStatus(tag, summary);

  console.log(
    `[${tag}] Found ${scannedItems.length} items (${deduplicated.length} unique) to process`,
  );

  const mediaCache = new Map<number, ResolvedMediaAnchor>();

  try {
    for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
      const batch = deduplicated.slice(i, i + BATCH_SIZE);
      for (const scanned of batch) {
        await processOne(db, tmdb, scanned, {
          tag,
          config,
          mediaCache,
          supportedLangs,
          tvdbEnabled,
          syncRunStart,
          summary,
          opts,
        });
        summary.processed++;
        await persistStatus(tag, summary);
        await sleep(ITEM_DELAY_MS);
      }
      if (i + BATCH_SIZE < deduplicated.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Phase 5 — reconcile the Server Library list (idempotent)
    try {
      await reconcileServerLibrary(db, tag);
    } catch (err) {
      console.warn(`[${tag}] Failed to reconcile Server Library:`, err);
    }

    summary.status = "completed";
    summary.completedAt = new Date().toISOString();
    await persistStatus(tag, summary);
    console.log(
      `[${tag}] Done. Imported: ${summary.imported}, Skipped: ${summary.skipped}, Unmatched: ${summary.unmatched}, Failed: ${summary.failed}`,
    );
    return summary;
  } catch (err) {
    console.error(
      `[${tag}] Sync run failed:`,
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : "",
    );
    summary.status = "failed";
    summary.error = err instanceof Error ? err.message : String(err);
    summary.completedAt = new Date().toISOString();
    await persistStatus(tag, summary);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Single-item processing                                                     */
/* -------------------------------------------------------------------------- */

interface ProcessCtx {
  tag: string;
  config: ServerConfig;
  mediaCache: Map<number, ResolvedMediaAnchor>;
  supportedLangs: readonly string[];
  tvdbEnabled: boolean;
  syncRunStart: Date;
  summary: SyncSummary;
  opts: SyncPipelineOptions;
}

async function processOne(
  db: Database,
  tmdb: MediaProviderPort,
  scanned: ScannedMediaItem,
  ctx: ProcessCtx,
): Promise<void> {
  const { tag, config, mediaCache, supportedLangs, tvdbEnabled, syncRunStart, summary, opts } = ctx;

  try {
    const anchor = await ensureMediaAnchor(
      db,
      tmdb,
      scanned,
      mediaCache,
      supportedLangs,
      tvdbEnabled,
    );

    if (!anchor) {
      // Trust Plex/Jellyfin as the source of truth: we never title-match
      // here. No provider id → "unmatched", admin action required.
      console.log(`[${tag}] Unmatched: ${scanned.title} (${scanned.year})`);
      summary.unmatched++;
      await upsertMediaVersion(
        db,
        toMediaVersionInsert(scanned, {
          result: "unmatched",
          reason: "No provider id on server — admin action required",
          syncedAt: syncRunStart,
        }),
      );
      return;
    }

    // Add to shared Server Library list
    try {
      const serverLib = await ensureServerLibrary(db);
      await addListItem(db, { listId: serverLib.id, mediaId: anchor.mediaId });
    } catch {
      /* already in server library */
    }

    if (opts.forUserId) {
      try {
        await addToUserMediaLibrary(db, {
          userId: opts.forUserId,
          mediaId: anchor.mediaId,
          source: scanned.source,
          serverLinkId: scanned.serverLinkId,
          serverItemId: scanned.serverItemId,
        });
      } catch (err) {
        console.error(`[${tag}] Failed to link media to user library:`, err);
      }
    }

    if (anchor.isNewImport) summary.imported++;
    else summary.skipped++;

    // Fetch quality metadata from the server so it lands on the upsert.
    let files: MediaFileInfo[] = [];
    try {
      files = await fetchMediaFilesFor(scanned, config);
    } catch (err) {
      console.error(`[${tag}] Failed to fetch media info for ${scanned.title}:`, err);
    }
    const topLevel = pickTopLevelFileInfo(files, scanned.type);

    const upserted = await upsertMediaVersion(
      db,
      toMediaVersionInsert(scanned, {
        mediaId: anchor.mediaId,
        tmdbId: anchor.tmdbId,
        result: anchor.isNewImport ? "imported" : "skipped",
        reason: anchor.isNewImport ? null : "Already in library",
        syncedAt: syncRunStart,
        quality: topLevel,
      }),
    );

    if (upserted && scanned.type === "show" && files.length > 0) {
      try {
        await persistEpisodesFor(db, upserted.id, files);
      } catch (err) {
        console.error(`[${tag}] Failed to persist episodes for ${scanned.title}:`, err);
      }
    }

    if (anchor.isNewImport) {
      console.log(`[${tag}] Imported: ${scanned.title} (${scanned.year})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${tag}] Error processing ${scanned.title}:`, msg);
    summary.failed++;
    await upsertMediaVersion(
      db,
      toMediaVersionInsert(scanned, {
        result: "failed",
        reason: msg.slice(0, 500),
        syncedAt: syncRunStart,
      }),
    );
  }
}
