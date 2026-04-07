/* -------------------------------------------------------------------------- */
/*  Use-case: Process pending media imports from server scans                */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { TmdbProvider } from "@canto/providers";
import { persistMedia, getSupportedLanguageCodes } from "@canto/db/persist-media";
import { getSetting, setSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { dispatchMediaPipeline } from "../../infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "../../lib/log-error";
import {
  findMediaByAnyReference,
  updateMedia,
  createSyncEpisodes,
  upsertSyncItemByServerKey,
  pruneOldSyncItems,
  deleteSyncEpisodesBySyncItemId,
  updateServerLink,
  ensureServerLibrary,
  addListItem,
} from "../../infrastructure/repositories";
import { reconcileServerLibrary } from "../../infrastructure/repositories/list-repository";
import type { PendingImport } from "./scan-jellyfin-media";
import { resolveExternalId, tmdbCall } from "./resolve-external-id";
import {
  fetchJellyfinMediaInfo,
  fetchPlexMediaInfo,
  type MediaFileInfo,
} from "./fetch-server-media-info";

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

interface SyncStatus {
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateStatus(tag: string, status: SyncStatus): Promise<void> {
  await setSetting(`${STATUS_KEY_PREFIX}.${tag}`, status);
}

function syncItemBase(item: PendingImport): {
  libraryId: string | null;
  serverLinkId: string;
  serverItemTitle: string;
  serverItemPath: string | undefined;
  serverItemYear: number | undefined;
  source: string;
  jellyfinItemId: string | undefined;
  plexRatingKey: string | undefined;
} {
  return {
    libraryId: item.libraryId,
    serverLinkId: item.serverLinkId,
    serverItemTitle: item.title,
    serverItemPath: item.path,
    serverItemYear: item.year,
    source: item.source,
    jellyfinItemId: item.jellyfinItemId,
    plexRatingKey: item.plexRatingKey,
  };
}

async function fetchAndStoreSyncEpisodes(
  db: Database,
  syncItemId: string,
  item: PendingImport,
  serverConfig: ServerConfig,
): Promise<void> {
  await deleteSyncEpisodesBySyncItemId(db, syncItemId);
  let mediaFiles: MediaFileInfo[] = [];
  if (item.source === "jellyfin" && item.jellyfinItemId && serverConfig.jellyfinUrl && serverConfig.jellyfinKey) {
    mediaFiles = await fetchJellyfinMediaInfo(serverConfig.jellyfinUrl, serverConfig.jellyfinKey, item.jellyfinItemId, item.type);
  } else if (item.source === "plex" && item.plexRatingKey && serverConfig.plexUrl && serverConfig.plexToken) {
    mediaFiles = await fetchPlexMediaInfo(serverConfig.plexUrl, serverConfig.plexToken, item.plexRatingKey, item.type);
  }
  if (mediaFiles.length > 0) {
    await createSyncEpisodes(
      db,
      mediaFiles.map((f) => ({
        syncItemId,
        seasonNumber: f.seasonNumber,
        episodeNumber: f.episodeNumber,
        serverEpisodeId: f.serverEpisodeId,
        resolution: f.resolution,
        videoCodec: f.videoCodec,
        audioCodec: f.audioCodec,
        container: f.container,
        fileSize: f.fileSize,
        filePath: f.filePath,
      })),
    );
  }
}

interface ServerConfig {
  jellyfinUrl: string | null | undefined;
  jellyfinKey: string | null | undefined;
  plexUrl: string | null | undefined;
  plexToken: string | null | undefined;
}

/* -------------------------------------------------------------------------- */
/*  Main use-case                                                              */
/* -------------------------------------------------------------------------- */

export async function processSyncImports(
  db: Database,
  pending: PendingImport[],
  tag: string,
  tmdb: TmdbProvider,
): Promise<void> {
  if (pending.length === 0) {
    console.log(`[${tag}] No items to process`);
    return;
  }

  const syncRunStart = new Date();

  const tvdbEnabled = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;

  const serverConfig: ServerConfig = {
    jellyfinUrl: await getSetting<string>("jellyfin.url"),
    jellyfinKey: await getSetting<string>("jellyfin.apiKey"),
    plexUrl: await getSetting<string>("plex.url"),
    plexToken: await getSetting<string>("plex.token"),
  };

  const syncedLibraryIds = [...new Set(pending.map((i) => i.libraryId).filter((id): id is string => id != null))];
  const syncedLinkIds = [...new Set(pending.map((i) => i.serverLinkId))];
  const source = pending[0]?.source;

  // Deduplicate for processing (don't fetch TMDB twice for same item)
  const seen = new Set<string>();
  const deduplicated = pending.filter((item) => {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title}:${item.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[${tag}] Found ${pending.length} items (${deduplicated.length} unique) to process`);

  const status: SyncStatus = {
    status: "running",
    total: deduplicated.length,
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
  };
  await updateStatus(tag, status);

  // Process in batches
  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);

    for (const item of batch) {
      try {
        const resolved = await resolveExternalId(tmdb, item);

        if (!resolved) {
          console.log(`[reverse-sync] Could not resolve: ${item.title} (${item.year})`);
          status.failed++;
          await upsertSyncItemByServerKey(db, {
            ...syncItemBase(item),
            result: "failed",
            reason: "Could not find on TMDB",
            syncedAt: syncRunStart,
          });
          status.processed++;
          await updateStatus(tag, status);
          await sleep(ITEM_DELAY_MS);
          continue;
        }

        const { tmdbId, resolvedType } = resolved;

        // Check if already in our DB
        const existing = await findMediaByAnyReference(db, tmdbId, "tmdb", item.imdbId);

        let mediaId: string;

        if (existing) {
          mediaId = existing.id;

          const updates: Record<string, unknown> = {};
          if (!existing.inLibrary) updates.inLibrary = true;
          if (!existing.downloaded) updates.downloaded = true;
          if (!existing.libraryId && item.libraryId) updates.libraryId = item.libraryId;
          if (!existing.libraryPath && item.path) updates.libraryPath = item.path;
          if (!existing.addedAt) updates.addedAt = new Date();

          if (Object.keys(updates).length > 0) {
            await updateMedia(db, existing.id, updates);
          }

          if (!existing.metadataUpdatedAt) {
            void dispatchMediaPipeline({ mediaId: existing.id }).catch(logAndSwallow("reverse-sync dispatchMediaPipeline"));
          }

          if (existing.inLibrary) {
            status.skipped++;
            const skippedSyncItem = await upsertSyncItemByServerKey(db, {
              ...syncItemBase(item),
              tmdbId,
              mediaId,
              result: "skipped",
              reason: "Already in library",
              syncedAt: syncRunStart,
            });

            if (skippedSyncItem) {
              try {
                await fetchAndStoreSyncEpisodes(db, skippedSyncItem.id, item, serverConfig);
              } catch (err) {
                console.error(`[reverse-sync] Failed to fetch media info for ${item.title}:`, err);
              }
            }

            status.processed++;
            await updateStatus(tag, status);
            await sleep(ITEM_DELAY_MS);
            continue;
          }
        } else {
          // New media: persist from TMDB + enrich
          const supportedLangs = [...await getSupportedLanguageCodes(db)];
          const normalized = await tmdbCall(() => tmdb.getMetadata(tmdbId, resolvedType, { supportedLanguages: supportedLangs }));
          const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });
          const mediaUpdates: Record<string, unknown> = { inLibrary: true, downloaded: true, libraryPath: item.path, addedAt: new Date() };
          if (item.libraryId) mediaUpdates.libraryId = item.libraryId;
          await updateMedia(db, inserted.id, mediaUpdates);
          mediaId = inserted.id;
          void dispatchMediaPipeline({ mediaId: inserted.id }).catch(logAndSwallow("reverse-sync dispatchMediaPipeline"));
        }

        // Add to Server Library list
        try {
          const serverLib = await ensureServerLibrary(db);
          await addListItem(db, { listId: serverLib.id, mediaId });
        } catch { /* already in server library */ }

        status.imported++;
        const insertedSyncItem = await upsertSyncItemByServerKey(db, {
          ...syncItemBase(item),
          tmdbId,
          mediaId,
          result: "imported",
          syncedAt: syncRunStart,
        });

        if (insertedSyncItem) {
          try {
            await fetchAndStoreSyncEpisodes(db, insertedSyncItem.id, item, serverConfig);
          } catch (err) {
            console.error(`[reverse-sync] Failed to fetch media info for ${item.title}:`, err);
          }
        }

        console.log(`[reverse-sync] Imported: ${item.title} (${item.year})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[reverse-sync] Error processing ${item.title}:`, msg);
        status.failed++;
        await upsertSyncItemByServerKey(db, {
          ...syncItemBase(item),
          tmdbId: item.tmdbId,
          result: "failed",
          reason: msg.slice(0, 500),
          syncedAt: syncRunStart,
        });
      }

      status.processed++;
      await updateStatus(tag, status);
      await sleep(ITEM_DELAY_MS);
    }

    if (i + BATCH_SIZE < deduplicated.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Record sync_items for duplicate items from other sources
  const processedKeys = new Set<string>();
  for (const item of deduplicated) {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title}:${item.year}`;
    processedKeys.add(`${key}:${item.source}:${item.libraryId}`);
  }
  for (const item of pending) {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title}:${item.year}`;
    const itemKey = `${key}:${item.source}:${item.libraryId}`;
    if (processedKeys.has(itemKey)) continue;
    processedKeys.add(itemKey);

    const tmdbId = item.tmdbId;
    let mediaId: string | undefined;
    if (tmdbId) {
      const existing = await findMediaByAnyReference(db, tmdbId, "tmdb", item.imdbId);
      mediaId = existing?.id;
    }

    await upsertSyncItemByServerKey(db, {
      ...syncItemBase(item),
      tmdbId: item.tmdbId,
      mediaId: mediaId ?? null,
      result: mediaId ? "skipped" : "failed",
      reason: mediaId ? "Already in library" : "Could not resolve",
      syncedAt: syncRunStart,
    });
  }

  // Prune sync items no longer present on the server
  if (source) {
    await pruneOldSyncItems(db, syncedLibraryIds, source, syncRunStart, syncedLinkIds);
  }

  // Update lastSyncedAt per link
  for (const linkId of syncedLinkIds) {
    await updateServerLink(db, linkId, { lastSyncedAt: new Date() });
  }

  // Reconcile Server Library
  try {
    await reconcileServerLibrary(db, tag);
  } catch (err) {
    console.warn(`[${tag}] Failed to reconcile Server Library:`, err);
  }

  status.status = "completed";
  status.completedAt = new Date().toISOString();
  await updateStatus(tag, status);

  console.log(
    `[${tag}] Done. Imported: ${status.imported}, Skipped: ${status.skipped}, Failed: ${status.failed}`,
  );
}
