/* -------------------------------------------------------------------------- */
/*  Sync pipeline                                                              */
/*                                                                            */
/*  Consumes ScannedMediaItem[] from the scanners and walks them through a   */
/*  series of well-defined phases. Each phase is a small, side-effect-free   */
/*  function where possible; the orchestrator is the only place that talks   */
/*  to the database.                                                          */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { getSetting, setSettingRaw } from "@canto/db/settings";

import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";

import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { UpdateMediaInput } from "@canto/core/domain/media/types/media";
import { persistMedia } from "@canto/core/domain/media/use-cases/persist";
import {
  resolveExternalId,
  tmdbCall,
} from "@canto/core/domain/media/use-cases/resolve-external-id";

import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { MediaVersionInsert } from "@canto/core/domain/media-servers/types/media-version";
import {
  fetchJellyfinMediaInfo,
  fetchPlexMediaInfo,
} from "@canto/core/domain/media-servers/use-cases/fetch-info";
import type { MediaFileInfo } from "@canto/core/domain/media-servers/use-cases/fetch-info";

import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";

import {
  createMediaAnchorCache,
} from "@canto/core/domain/sync/media-resolution-cache";
import type {
  MediaAnchorCache,
  ResolvedMediaAnchor,
} from "@canto/core/domain/sync/media-resolution-cache";
import type {
  ScannedMediaItem,
  SyncResult,
  SyncSummary,
} from "@canto/core/domain/sync/types";
import { emptySummary } from "@canto/core/domain/sync/types";

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
  jellyfinUrl: string | null;
  jellyfinKey: string | null;
  plexUrl: string | null;
  plexToken: string | null;
}

export interface SyncPipelineOptions {
  /** If set, sync output is also linked into this user's personal library. */
  forUserId?: string;
}

export interface RunSyncPipelineDeps {
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
  jellyfin: JellyfinAdapterPort;
  plex: PlexAdapterPort;
  media: MediaRepositoryPort;
  mediaVersions: MediaVersionRepositoryPort;
  mediaAspectState: MediaAspectStateRepositoryPort;
  lists: ListsRepositoryPort;
  userMedia: UserMediaRepositoryPort;
  credentials: ServerCredentialsPort;
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

interface EnsureMediaAnchorArgs {
  db: Database;
  tmdb: MediaProviderPort;
  deps: RunSyncPipelineDeps;
  scanned: ScannedMediaItem;
  cache: MediaAnchorCache;
  supportedLangs: readonly string[];
  tvdbEnabled: boolean;
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
  args: EnsureMediaAnchorArgs,
): Promise<ResolvedMediaAnchor | null> {
  const { db, tmdb, deps, scanned, cache, supportedLangs, tvdbEnabled } = args;
  const resolved = await resolveExternalId(tmdb, {
    tmdbId: scanned.externalIds.tmdb,
    imdbId: scanned.externalIds.imdb,
    tvdbId: scanned.externalIds.tvdb,
    type: scanned.type,
  });
  if (!resolved) return null;

  const cached = cache.get(resolved.tmdbId);
  if (cached) {
    return { ...cached, isNewImport: false };
  }

  const existing = await deps.media.findByAnyReference(
    resolved.tmdbId,
    "tmdb",
    scanned.externalIds.imdb,
    scanned.externalIds.tvdb,
  );

  if (existing) {
    const updates: UpdateMediaInput = {};
    if (!existing.inLibrary) updates.inLibrary = true;
    if (!existing.downloaded) updates.downloaded = true;
    if (!existing.libraryId && scanned.libraryId) updates.libraryId = scanned.libraryId;
    if (!existing.libraryPath && scanned.path) updates.libraryPath = scanned.path;
    if (!existing.addedAt) updates.addedAt = new Date();
    if (Object.keys(updates).length > 0) {
      await deps.media.updateMedia(existing.id, updates);
    }
    const metadataSucceededAt = await deps.mediaAspectState.findSucceededAt(
      existing.id,
      "metadata",
    );
    if (!metadataSucceededAt) {
      void deps.dispatcher.enrichMedia(existing.id).catch(
        deps.logger.logAndSwallow("sync-pipeline dispatchEnsureMedia"),
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

  const normalized = await tmdbCall(() =>
    tmdb.getMetadata(resolved.tmdbId, resolved.resolvedType, {
      supportedLanguages: supportedLangs as string[],
    }),
  );
  const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });
  const mediaUpdates: UpdateMediaInput = {
    inLibrary: true,
    downloaded: true,
    libraryPath: scanned.path,
    addedAt: new Date(),
  };
  if (scanned.libraryId) mediaUpdates.libraryId = scanned.libraryId;
  await deps.media.updateMedia(inserted.id, mediaUpdates);
  void deps.dispatcher.enrichMedia(inserted.id).catch(
    deps.logger.logAndSwallow("sync-pipeline dispatchEnsureMedia"),
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
  jellyfin: JellyfinAdapterPort,
  plex: PlexAdapterPort,
  scanned: ScannedMediaItem,
  config: ServerConfig,
): Promise<MediaFileInfo[]> {
  if (scanned.source === "jellyfin") {
    if (!config.jellyfinUrl || !config.jellyfinKey) return [];
    return fetchJellyfinMediaInfo(
      jellyfin,
      config.jellyfinUrl,
      config.jellyfinKey,
      scanned.serverItemId,
      scanned.type,
    );
  }
  if (!config.plexUrl || !config.plexToken) return [];
  return fetchPlexMediaInfo(
    plex,
    config.plexUrl,
    config.plexToken,
    scanned.serverItemId,
    scanned.type,
  );
}

/**
 * Pick the top-level MediaFileInfo to attach to the media_version row.
 * For movies there's exactly one entry; for shows we surface the first
 * episode as a representative — per-episode detail still lives in
 * media_version_episode children.
 */
function pickTopLevelFileInfo(
  files: MediaFileInfo[],
  type: "movie" | "show",
): MediaFileInfo | undefined {
  if (files.length === 0) return undefined;
  if (type === "movie") return files[0];
  return files[0];
}

async function persistEpisodesFor(
  mediaVersions: MediaVersionRepositoryPort,
  versionId: string,
  files: MediaFileInfo[],
): Promise<void> {
  await mediaVersions.deleteEpisodesByVersionId(versionId);
  const episodeFiles = files.filter(
    (f) => f.seasonNumber !== undefined || f.episodeNumber !== undefined,
  );
  if (episodeFiles.length === 0) return;
  await mediaVersions.createEpisodes(
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

async function loadServerConfig(
  credentials: ServerCredentialsPort,
): Promise<ServerConfig> {
  const [jellyfin, plex] = await Promise.all([
    credentials.getJellyfin(),
    credentials.getPlex(),
  ]);
  return {
    jellyfinUrl: jellyfin?.url ?? null,
    jellyfinKey: jellyfin?.apiKey ?? null,
    plexUrl: plex?.url ?? null,
    plexToken: plex?.token ?? null,
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
  deps: RunSyncPipelineDeps,
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
  const config = await loadServerConfig(deps.credentials);
  const supportedLangs = [...(await getActiveUserLanguages(db))];

  // Phase 1 + 2 — validate + dedupe
  const validated = validateScannedItems(scannedItems, tag);
  const deduplicated = deduplicateScannedItems(validated);

  const summary = emptySummary(deduplicated.length);
  await persistStatus(tag, summary);

  console.log(
    `[${tag}] Found ${scannedItems.length} items (${deduplicated.length} unique) to process`,
  );

  const mediaCache = createMediaAnchorCache();

  try {
    for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
      const batch = deduplicated.slice(i, i + BATCH_SIZE);
      for (const scanned of batch) {
        await processOne(db, tmdb, deps, scanned, {
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
      await deps.lists.reconcileServerLibrary(tag);
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
  mediaCache: MediaAnchorCache;
  supportedLangs: readonly string[];
  tvdbEnabled: boolean;
  syncRunStart: Date;
  summary: SyncSummary;
  opts: SyncPipelineOptions;
}

async function processOne(
  db: Database,
  tmdb: MediaProviderPort,
  deps: RunSyncPipelineDeps,
  scanned: ScannedMediaItem,
  ctx: ProcessCtx,
): Promise<void> {
  const { tag, config, mediaCache, supportedLangs, tvdbEnabled, syncRunStart, summary, opts } = ctx;

  try {
    const anchor = await ensureMediaAnchor({
      db,
      tmdb,
      deps,
      scanned,
      cache: mediaCache,
      supportedLangs,
      tvdbEnabled,
    });

    if (!anchor) {
      console.log(`[${tag}] Unmatched: ${scanned.title} (${scanned.year})`);
      summary.unmatched++;
      await deps.mediaVersions.upsert(
        toMediaVersionInsert(scanned, {
          result: "unmatched",
          reason: "No provider id on server — admin action required",
          syncedAt: syncRunStart,
        }),
      );
      return;
    }

    try {
      const serverLib = await deps.lists.ensureServerLibrary();
      await deps.lists.addItem({ listId: serverLib.id, mediaId: anchor.mediaId });
    } catch {
      /* already in server library */
    }

    if (opts.forUserId) {
      try {
        await deps.userMedia.addToLibrary({
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

    let files: MediaFileInfo[] = [];
    try {
      files = await fetchMediaFilesFor(deps.jellyfin, deps.plex, scanned, config);
    } catch (err) {
      console.error(`[${tag}] Failed to fetch media info for ${scanned.title}:`, err);
    }
    const topLevel = pickTopLevelFileInfo(files, scanned.type);

    const upserted = await deps.mediaVersions.upsert(
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
        await persistEpisodesFor(deps.mediaVersions, upserted.id, files);
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
    await deps.mediaVersions.upsert(
      toMediaVersionInsert(scanned, {
        result: "failed",
        reason: msg.slice(0, 500),
        syncedAt: syncRunStart,
      }),
    );
  }
}
