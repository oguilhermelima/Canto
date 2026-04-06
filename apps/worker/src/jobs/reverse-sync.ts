import { db } from "@canto/db/client";
import { getSetting, setSetting } from "@canto/db/settings";
import { persistMedia, getSupportedLanguageCodes } from "@canto/db/persist-media";
import { TmdbProvider } from "@canto/providers";
import {
  findEnabledSyncLinks,
  findMediaByAnyReference,
  updateMedia,
  createSyncEpisodes,
  upsertSyncItemByServerKey,
  pruneOldSyncItems,
  deleteSyncEpisodesBySyncItemId,
  updateServerLink,
  ensureServerLibrary,
  addListItem,
} from "@canto/api/infrastructure/repositories";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { dispatchEnrichMedia } from "@canto/api/infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "@canto/api/lib/log-error";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2_000;
const ITEM_DELAY_MS = 250;
const TMDB_DELAY_MS = 300;
const TMDB_MAX_RETRIES = 3;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PendingImport {
  tmdbId?: number;
  imdbId?: string;
  title: string;
  year?: number;
  type: "movie" | "show";
  libraryId: string | null;
  serverLinkId: string;
  path?: string;
  source: "jellyfin" | "plex";
  jellyfinItemId?: string;
  plexRatingKey?: string;
}

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

const STATUS_KEY_PREFIX = "sync.mediaImport.status";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tmdbCall<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      await sleep(TMDB_DELAY_MS);
      return result;
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt < TMDB_MAX_RETRIES) {
        const backoff = 2_000 * Math.pow(2, attempt);
        console.warn(`[reverse-sync] TMDB rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${TMDB_MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error("TMDB call failed after retries");
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

/* -------------------------------------------------------------------------- */
/*  Jellyfin scanner                                                           */
/* -------------------------------------------------------------------------- */

async function scanJellyfin(
  url: string,
  apiKey: string,
  libs: Array<{ folderId: string | null; jellyfinLibraryId: string; type: string; linkId: string }>,
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const typesToScan = lib.type === "mixed"
      ? [{ mediaType: "movie" as const, includeTypes: "Movie" }, { mediaType: "show" as const, includeTypes: "Series" }]
      : [{ mediaType: (lib.type === "movies" ? "movie" : "show") as "movie" | "show", includeTypes: lib.type === "movies" ? "Movie" : "Series" }];

    for (const { mediaType, includeTypes } of typesToScan) {
      let startIndex = 0;
      const pageSize = 500;

      try {
        while (true) {
          const res = await fetch(
            `${url}/Items?ParentId=${lib.jellyfinLibraryId}&IncludeItemTypes=${includeTypes}&Fields=ProviderIds,Path,ProductionYear&Recursive=true&StartIndex=${startIndex}&Limit=${pageSize}`,
            { headers: { "X-Emby-Token": apiKey }, signal: AbortSignal.timeout(30_000) },
          );
          if (!res.ok) {
            throw new Error(`Jellyfin API returned HTTP ${res.status} at offset ${startIndex}`);
          }

          const data = await res.json() as {
            Items: Array<{
              Id: string;
              Name: string;
              ProductionYear?: number;
              Path?: string;
              ProviderIds?: { Tmdb?: string; Imdb?: string };
            }>;
            TotalRecordCount: number;
          };

          for (const item of data.Items) {
            const tmdbStr = item.ProviderIds?.Tmdb;
            items.push({
              tmdbId: tmdbStr ? parseInt(tmdbStr, 10) : undefined,
              imdbId: item.ProviderIds?.Imdb,
              title: item.Name,
              year: item.ProductionYear,
              type: mediaType,
              libraryId: lib.folderId,
              serverLinkId: lib.linkId,
              path: item.Path,
              source: "jellyfin",
              jellyfinItemId: item.Id,
            });
          }

          startIndex += pageSize;
          if (startIndex >= data.TotalRecordCount) break;
        }
      } catch (err) {
        console.warn(
          `[jellyfin-scan] Partial sync for library ${lib.jellyfinLibraryId} (${includeTypes}): ${err instanceof Error ? err.message : err}. Returning ${items.length} items fetched so far.`,
        );
      }
    }
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/*  Plex scanner                                                               */
/* -------------------------------------------------------------------------- */

async function scanPlex(
  url: string,
  token: string,
  libs: Array<{ folderId: string | null; plexLibraryId: string; type: string; linkId: string }>,
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const plexPageSize = 100;
    let offset = 0;

    while (true) {
      const res = await fetch(
        `${url}/library/sections/${lib.plexLibraryId}/all?X-Plex-Token=${token}&includeGuids=1&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${plexPageSize}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) },
      );
      if (!res.ok) break;

      const data = await res.json() as {
        MediaContainer: {
          totalSize?: number;
          size?: number;
          Metadata?: Array<{
            ratingKey: string;
            title: string;
            year?: number;
            type?: string;
            Guid?: Array<{ id: string }>;
          }>;
        };
      };

      const metadata = data.MediaContainer.Metadata ?? [];
      for (const item of metadata) {
        let tmdbId: number | undefined;
        let imdbId: string | undefined;

        for (const guid of item.Guid ?? []) {
          if (guid.id.startsWith("tmdb://")) {
            tmdbId = parseInt(guid.id.replace("tmdb://", ""), 10);
          } else if (guid.id.startsWith("imdb://")) {
            imdbId = guid.id.replace("imdb://", "");
          }
        }

        // Determine media type: use link's contentType, fall back to item's type from Plex
        let mediaType: "movie" | "show";
        if (lib.type === "mixed") {
          mediaType = item.type === "movie" ? "movie" : "show";
        } else {
          mediaType = lib.type === "movies" ? "movie" : "show";
        }

        items.push({
          tmdbId,
          imdbId,
          title: item.title,
          year: item.year,
          type: mediaType,
          libraryId: lib.folderId,
          serverLinkId: lib.linkId,
          source: "plex",
          plexRatingKey: item.ratingKey,
        });
      }

      offset += plexPageSize;
      const totalSize = data.MediaContainer.totalSize ?? 0;
      if (metadata.length < plexPageSize || offset >= totalSize) break;
    }
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/*  Media info fetching                                                        */
/* -------------------------------------------------------------------------- */

function normalizeResolution(height?: number): string | undefined {
  if (!height) return undefined;
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return "SD";
}

interface MediaFileInfo {
  seasonNumber?: number;
  episodeNumber?: number;
  serverEpisodeId?: string;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  fileSize?: number;
  filePath?: string;
}

async function fetchJellyfinMediaInfo(
  url: string,
  apiKey: string,
  itemId: string,
  type: "movie" | "show",
): Promise<MediaFileInfo[]> {
  const headers = { "X-Emby-Token": apiKey };
  const results: MediaFileInfo[] = [];

  if (type === "movie") {
    const res = await fetch(`${url}/Items/${itemId}?Fields=MediaSources`, { headers });
    if (!res.ok) return [];
    const data = await res.json() as {
      MediaSources?: Array<{
        Container?: string;
        Size?: number;
        Path?: string;
        MediaStreams?: Array<{ Type: string; Height?: number; Codec?: string }>;
      }>;
    };
    const src = data.MediaSources?.[0];
    if (src) {
      const videoStream = src.MediaStreams?.find((s) => s.Type === "Video");
      const audioStream = src.MediaStreams?.find((s) => s.Type === "Audio");
      results.push({
        resolution: normalizeResolution(videoStream?.Height),
        videoCodec: videoStream?.Codec,
        audioCodec: audioStream?.Codec,
        container: src.Container,
        fileSize: src.Size,
        filePath: src.Path,
      });
    }
  } else {
    // Fetch all episodes
    let startIndex = 0;
    while (true) {
      const res = await fetch(
        `${url}/Shows/${itemId}/Episodes?Fields=MediaSources&StartIndex=${startIndex}&Limit=500`,
        { headers },
      );
      if (!res.ok) break;
      const data = await res.json() as {
        Items: Array<{
          Id: string;
          ParentIndexNumber?: number;
          IndexNumber?: number;
          MediaSources?: Array<{
            Container?: string;
            Size?: number;
            Path?: string;
            MediaStreams?: Array<{ Type: string; Height?: number; Codec?: string }>;
          }>;
        }>;
        TotalRecordCount: number;
      };
      for (const ep of data.Items) {
        const src = ep.MediaSources?.[0];
        const videoStream = src?.MediaStreams?.find((s) => s.Type === "Video");
        const audioStream = src?.MediaStreams?.find((s) => s.Type === "Audio");
        results.push({
          seasonNumber: ep.ParentIndexNumber,
          episodeNumber: ep.IndexNumber,
          serverEpisodeId: ep.Id,
          resolution: normalizeResolution(videoStream?.Height),
          videoCodec: videoStream?.Codec,
          audioCodec: audioStream?.Codec,
          container: src?.Container,
          fileSize: src?.Size,
          filePath: src?.Path,
        });
      }
      startIndex += 500;
      if (startIndex >= data.TotalRecordCount) break;
    }
  }

  return results;
}

async function fetchPlexMediaInfo(
  url: string,
  token: string,
  ratingKey: string,
  type: "movie" | "show",
): Promise<MediaFileInfo[]> {
  const results: MediaFileInfo[] = [];

  if (type === "movie") {
    const res = await fetch(`${url}/library/metadata/${ratingKey}?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      MediaContainer: {
        Metadata?: Array<{
          Media?: Array<{
            videoCodec?: string;
            audioCodec?: string;
            container?: string;
            Part?: Array<{ size?: number; file?: string; height?: number }>;
          }>;
        }>;
      };
    };
    const item = data.MediaContainer.Metadata?.[0];
    const m = item?.Media?.[0];
    const part = m?.Part?.[0];
    results.push({
      resolution: normalizeResolution(part?.height),
      videoCodec: m?.videoCodec,
      audioCodec: m?.audioCodec,
      container: m?.container,
      fileSize: part?.size,
      filePath: part?.file,
    });
  } else {
    // Fetch all episodes via allLeaves
    const res = await fetch(`${url}/library/metadata/${ratingKey}/allLeaves?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          parentIndex?: number;
          index?: number;
          Media?: Array<{
            videoCodec?: string;
            audioCodec?: string;
            container?: string;
            Part?: Array<{ size?: number; file?: string; height?: number }>;
          }>;
        }>;
      };
    };
    for (const ep of data.MediaContainer.Metadata ?? []) {
      const m = ep.Media?.[0];
      const part = m?.Part?.[0];
      results.push({
        seasonNumber: ep.parentIndex,
        episodeNumber: ep.index,
        serverEpisodeId: ep.ratingKey,
        resolution: normalizeResolution(part?.height),
        videoCodec: m?.videoCodec,
        audioCodec: m?.audioCodec,
        container: m?.container,
        fileSize: part?.size,
        filePath: part?.file,
      });
    }
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Shared processing                                                          */
/* -------------------------------------------------------------------------- */

async function processPendingImports(
  pending: PendingImport[],
  tag: string,
): Promise<void> {
  if (pending.length === 0) {
    console.log(`[${tag}] No items to process`);
    return;
  }

  const syncRunStart = new Date();

  const tmdbApiKey = await getSetting<string>("tmdb.apiKey");
  if (!tmdbApiKey) throw new Error("TMDB API key not configured");

  const tmdb = new TmdbProvider(tmdbApiKey);
  const tvdbEnabled = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;

  // Settings for media info fetching
  const jellyfinUrl = await getSetting<string>("jellyfin.url");
  const jellyfinKey = await getSetting<string>("jellyfin.apiKey");
  const plexUrl = await getSetting<string>("plex.url");
  const plexToken = await getSetting<string>("plex.token");

  const syncedLibraryIds = [...new Set(pending.map((i) => i.libraryId).filter((id): id is string => id != null))];
  const syncedLinkIds = [...new Set(pending.map((i) => i.serverLinkId))];
  const source = pending[0]?.source;

  // Deduplicate for processing (don't fetch TMDB twice for same item)
  // But we still record sync_items for all libraries
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
        // Resolve TMDB ID if missing
        let tmdbId = item.tmdbId;
        let resolvedType = item.type;

        if (!tmdbId && item.imdbId) {
          const results = await tmdbCall(() => tmdb.findByImdbId(item.imdbId!));
          const match = results.find((r) => r.type === item.type) ?? results[0];
          if (match) {
            tmdbId = match.externalId;
            resolvedType = match.type as "movie" | "show";
          }
        }

        if (!tmdbId) {
          const query = item.year ? `${item.title} ${item.year}` : item.title;
          const searchResult = await tmdbCall(() => tmdb.search(query, item.type));
          if (searchResult.results.length === 1) {
            tmdbId = searchResult.results[0]!.externalId;
            resolvedType = searchResult.results[0]!.type as "movie" | "show";
          }
        }

        if (!tmdbId) {
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

        // Check if already in our DB (always cross-reference by IMDB for dedup)
        const existing = await findMediaByAnyReference(db, tmdbId, "tmdb", item.imdbId);

        let mediaId: string;

        if (existing) {
          mediaId = existing.id;

          // Idempotent: only update fields that the sync owns (inLibrary, downloaded, library, path)
          // Never touch metadata, seasons, processing_status, or provider data
          const updates: Record<string, unknown> = {};
          if (!existing.inLibrary) updates.inLibrary = true;
          if (!existing.downloaded) updates.downloaded = true;
          if (!existing.libraryId && item.libraryId) updates.libraryId = item.libraryId;
          if (!existing.libraryPath && item.path) updates.libraryPath = item.path;
          if (!existing.addedAt) updates.addedAt = new Date();
          // Note: when libraryId is null (unlinked sync), we still mark inLibrary/downloaded but skip libraryId

          if (Object.keys(updates).length > 0) {
            await updateMedia(db, existing.id, updates);
          }

          // Only enrich if media has never been enriched (no metadata yet)
          // Don't re-enrich already-ready media — that destroys TVDB data
          if (!existing.metadataUpdatedAt) {
            void dispatchEnrichMedia(existing.id, true).catch(logAndSwallow("reverse-sync dispatchEnrichMedia"));
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

            // Still fetch media info for skipped items (they exist on this server)
            if (skippedSyncItem) {
              try {
                await deleteSyncEpisodesBySyncItemId(db, skippedSyncItem.id);
                let mediaFiles: MediaFileInfo[] = [];
                if (item.source === "jellyfin" && item.jellyfinItemId && jellyfinUrl && jellyfinKey) {
                  mediaFiles = await fetchJellyfinMediaInfo(jellyfinUrl, jellyfinKey, item.jellyfinItemId, item.type);
                } else if (item.source === "plex" && item.plexRatingKey && plexUrl && plexToken) {
                  mediaFiles = await fetchPlexMediaInfo(plexUrl, plexToken, item.plexRatingKey, item.type);
                }
                if (mediaFiles.length > 0) {
                  await createSyncEpisodes(
                    db,
                    mediaFiles.map((f) => ({
                      syncItemId: skippedSyncItem.id,
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
          const normalized = await tmdbCall(() => tmdb.getMetadata(tmdbId!, resolvedType, { supportedLanguages: supportedLangs }));
          const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });
          const mediaUpdates: Record<string, unknown> = { inLibrary: true, downloaded: true, libraryPath: item.path, addedAt: new Date() };
          if (item.libraryId) mediaUpdates.libraryId = item.libraryId;
          await updateMedia(db, inserted.id, mediaUpdates);
          mediaId = inserted.id;
          void dispatchEnrichMedia(inserted.id, true).catch(logAndSwallow("reverse-sync dispatchEnrichMedia"));
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

        // Fetch media file info (resolution, codec, etc.)
        if (insertedSyncItem) {
          try {
            await deleteSyncEpisodesBySyncItemId(db, insertedSyncItem.id);
            let mediaFiles: MediaFileInfo[] = [];
            if (item.source === "jellyfin" && item.jellyfinItemId && jellyfinUrl && jellyfinKey) {
              mediaFiles = await fetchJellyfinMediaInfo(jellyfinUrl, jellyfinKey, item.jellyfinItemId, item.type);
            } else if (item.source === "plex" && item.plexRatingKey && plexUrl && plexToken) {
              mediaFiles = await fetchPlexMediaInfo(plexUrl, plexToken, item.plexRatingKey, item.type);
            }
            if (mediaFiles.length > 0) {
              await createSyncEpisodes(
                db,
                mediaFiles.map((f) => ({
                  syncItemId: insertedSyncItem.id,
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

  // Record sync_items for duplicate items from other sources (items filtered by dedup)
  // These are items that exist in multiple servers — record them as skipped with correct source
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

    // Find the media record for this TMDB ID
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

  // Reconcile Server Library — ensure it matches what's actually on servers
  try {
    const serverLib = await ensureServerLibrary(db);
    const { sql } = await import("drizzle-orm");

    // All media IDs that are confirmed on a server (imported torrents + synced items)
    const onServerRows = await db.execute(sql`
      SELECT DISTINCT media_id::text FROM (
        SELECT media_id FROM torrent WHERE imported = true AND media_id IS NOT NULL
        UNION
        SELECT media_id FROM sync_item WHERE result IN ('imported', 'skipped') AND media_id IS NOT NULL
      ) x
    `);
    const serverMediaIds = new Set(
      (onServerRows as unknown as Array<{ media_id: string }>).map((r) => r.media_id),
    );

    // Add missing items
    for (const mediaId of serverMediaIds) {
      await addListItem(db, { listId: serverLib.id, mediaId }).catch(() => { /* already in list */ });
    }

    // Remove items no longer on server
    if (serverMediaIds.size > 0) {
      const idsArray = [...serverMediaIds];
      await db.execute(sql`
        DELETE FROM list_item
        WHERE list_id = ${serverLib.id}::uuid
        AND media_id NOT IN (${sql.join(idsArray.map((id) => sql`${id}::uuid`), sql`, `)})
      `);
    }

    console.log(`[${tag}] Server Library reconciled: ${serverMediaIds.size} items`);
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

/* -------------------------------------------------------------------------- */
/*  Individual sync handlers                                                    */
/* -------------------------------------------------------------------------- */

export async function handleJellyfinSync(): Promise<void> {
  const jellyfinUrl = await getSetting<string>("jellyfin.url");
  const jellyfinKey = await getSetting<string>("jellyfin.apiKey");
  const jellyfinEnabled = await getSetting<boolean>("jellyfin.enabled");

  if (!jellyfinEnabled || !jellyfinUrl || !jellyfinKey) {
    console.log("[jellyfin-sync] Jellyfin not enabled or not configured");
    return;
  }

  const syncLinks = await findEnabledSyncLinks(db);
  const linked = syncLinks
    .filter((l) => l.serverType === "jellyfin")
    .map((l) => ({
      folderId: l.folderId ?? null,
      jellyfinLibraryId: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
    }));

  if (linked.length === 0) {
    console.log("[jellyfin-sync] No linked Jellyfin libraries");
    return;
  }

  console.log(`[jellyfin-sync] Scanning ${linked.length} Jellyfin libraries...`);
  const items = await scanJellyfin(jellyfinUrl, jellyfinKey, linked);
  await processPendingImports(items, "jellyfin-sync");
}

export async function handlePlexSync(): Promise<void> {
  const plexUrl = await getSetting<string>("plex.url");
  const plexToken = await getSetting<string>("plex.token");
  const plexEnabled = await getSetting<boolean>("plex.enabled");

  if (!plexEnabled || !plexUrl || !plexToken) {
    console.log("[plex-sync] Plex not enabled or not configured");
    return;
  }

  const plexSyncLinks = await findEnabledSyncLinks(db);
  const linked = plexSyncLinks
    .filter((l) => l.serverType === "plex")
    .map((l) => ({
      folderId: l.folderId ?? null,
      plexLibraryId: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
    }));

  if (linked.length === 0) {
    console.log("[plex-sync] No linked Plex libraries");
    return;
  }

  console.log(`[plex-sync] Scanning ${linked.length} Plex libraries...`);
  const items = await scanPlex(plexUrl, plexToken, linked);
  await processPendingImports(items, "plex-sync");
}

/* -------------------------------------------------------------------------- */
/*  Combined handler (for backward compat / global scheduler)                  */
/* -------------------------------------------------------------------------- */

export async function handleReverseSync(): Promise<void> {
  await handleJellyfinSync();
  await handlePlexSync();
}
