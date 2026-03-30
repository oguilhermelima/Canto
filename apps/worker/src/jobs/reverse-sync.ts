import { and, eq, inArray } from "drizzle-orm";

import { db } from "@canto/db/client";
import { library, media, syncItem, syncEpisode } from "@canto/db/schema";
import { getSetting, setSetting } from "@canto/db/settings";
import { persistMedia } from "@canto/db/persist-media";
import { TmdbProvider } from "@canto/providers";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2_000;
const ITEM_DELAY_MS = 250;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PendingImport {
  tmdbId?: number;
  imdbId?: string;
  title: string;
  year?: number;
  type: "movie" | "show";
  libraryId: string;
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

const STATUS_KEY = "sync.mediaImport.status";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateStatus(status: SyncStatus): Promise<void> {
  await setSetting(STATUS_KEY, status);
}

function syncItemBase(item: PendingImport): {
  libraryId: string;
  serverItemTitle: string;
  serverItemPath: string | undefined;
  serverItemYear: number | undefined;
  source: string;
  jellyfinItemId: string | undefined;
  plexRatingKey: string | undefined;
} {
  return {
    libraryId: item.libraryId,
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
  libs: Array<{ id: string; jellyfinLibraryId: string; type: string }>,
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const mediaType = lib.type === "movies" ? "movie" : "show";
    const includeTypes = lib.type === "movies" ? "Movie" : "Series";

    let startIndex = 0;
    const pageSize = 500;

    while (true) {
      const res = await fetch(
        `${url}/Items?ParentId=${lib.jellyfinLibraryId}&IncludeItemTypes=${includeTypes}&Fields=ProviderIds,Path,ProductionYear&Recursive=true&StartIndex=${startIndex}&Limit=${pageSize}`,
        { headers: { "X-Emby-Token": apiKey } },
      );
      if (!res.ok) break;

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
          libraryId: lib.id,
          path: item.Path,
          source: "jellyfin",
          jellyfinItemId: item.Id,
        });
      }

      startIndex += pageSize;
      if (startIndex >= data.TotalRecordCount) break;
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
  libs: Array<{ id: string; plexLibraryId: string; type: string }>,
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const mediaType = lib.type === "movies" ? "movie" : "show";

    const res = await fetch(
      `${url}/library/sections/${lib.plexLibraryId}/all?X-Plex-Token=${token}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) continue;

    const data = await res.json() as {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          title: string;
          year?: number;
          Guid?: Array<{ id: string }>;
        }>;
      };
    };

    for (const item of data.MediaContainer.Metadata ?? []) {
      let tmdbId: number | undefined;
      let imdbId: string | undefined;

      for (const guid of item.Guid ?? []) {
        if (guid.id.startsWith("tmdb://")) {
          tmdbId = parseInt(guid.id.replace("tmdb://", ""), 10);
        } else if (guid.id.startsWith("imdb://")) {
          imdbId = guid.id.replace("imdb://", "");
        }
      }

      items.push({
        tmdbId,
        imdbId,
        title: item.title,
        year: item.year,
        type: mediaType,
        libraryId: lib.id,
        source: "plex",
        plexRatingKey: item.ratingKey,
      });
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

export async function handleReverseSync(): Promise<void> {
  const tmdbApiKey = await getSetting<string>("tmdb.apiKey");
  if (!tmdbApiKey) throw new Error("TMDB API key not configured");

  const tmdb = new TmdbProvider(tmdbApiKey);

  // Gather pending imports from Jellyfin and Plex
  const pending: PendingImport[] = [];

  // Jellyfin
  const jellyfinUrl = await getSetting<string>("jellyfin.url");
  const jellyfinKey = await getSetting<string>("jellyfin.apiKey");
  const jellyfinEnabled = await getSetting<boolean>("jellyfin.enabled");

  if (jellyfinEnabled && jellyfinUrl && jellyfinKey) {
    const jellyfinLibs = await db.query.library.findMany({
      where: and(eq(library.enabled, true), eq(library.syncEnabled, true)),
    });
    const linked = jellyfinLibs
      .filter((l) => l.jellyfinLibraryId)
      .map((l) => ({ id: l.id, jellyfinLibraryId: l.jellyfinLibraryId!, type: l.type }));

    if (linked.length > 0) {
      console.log(`[reverse-sync] Scanning ${linked.length} Jellyfin libraries...`);
      const jellyfinItems = await scanJellyfin(jellyfinUrl, jellyfinKey, linked);
      pending.push(...jellyfinItems);
    }
  }

  // Plex
  const plexUrl = await getSetting<string>("plex.url");
  const plexToken = await getSetting<string>("plex.token");
  const plexEnabled = await getSetting<boolean>("plex.enabled");

  if (plexEnabled && plexUrl && plexToken) {
    const plexLibs = await db.query.library.findMany({
      where: and(eq(library.enabled, true), eq(library.syncEnabled, true)),
    });
    const linked = plexLibs
      .filter((l) => l.plexLibraryId)
      .map((l) => ({ id: l.id, plexLibraryId: l.plexLibraryId!, type: l.type }));

    if (linked.length > 0) {
      console.log(`[reverse-sync] Scanning ${linked.length} Plex libraries...`);
      const plexItems = await scanPlex(plexUrl, plexToken, linked);
      pending.push(...plexItems);
    }
  }

  // Clear previous sync items for libraries being synced
  const syncedLibraryIds = [...new Set(pending.map((i) => i.libraryId))];
  if (syncedLibraryIds.length > 0) {
    await db.delete(syncItem).where(inArray(syncItem.libraryId, syncedLibraryIds));
  }

  // Deduplicate for processing (don't fetch TMDB twice for same item)
  // But we still record sync_items for all libraries
  const seen = new Set<string>();
  const deduplicated = pending.filter((item) => {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title}:${item.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[reverse-sync] Found ${pending.length} items (${deduplicated.length} unique) to process`);

  const status: SyncStatus = {
    status: "running",
    total: deduplicated.length,
    processed: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
  };
  await updateStatus(status);

  // Process in batches
  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);

    for (const item of batch) {
      try {
        // Resolve TMDB ID if missing
        let tmdbId = item.tmdbId;
        let resolvedType = item.type;

        if (!tmdbId && item.imdbId) {
          const results = await tmdb.findByImdbId(item.imdbId);
          const match = results.find((r) => r.type === item.type) ?? results[0];
          if (match) {
            tmdbId = match.externalId;
            resolvedType = match.type as "movie" | "show";
          }
        }

        if (!tmdbId) {
          const results = await tmdb.search(item.title, {
            type: item.type,
            year: item.year,
          });
          if (results.length === 1) {
            tmdbId = results[0]!.externalId;
            resolvedType = results[0]!.type as "movie" | "show";
          }
        }

        if (!tmdbId) {
          console.log(`[reverse-sync] Could not resolve: ${item.title} (${item.year})`);
          status.failed++;
          await db.insert(syncItem).values({
            ...syncItemBase(item),
            result: "failed",
            reason: "Could not find on TMDB",
          });
          status.processed++;
          await updateStatus(status);
          await sleep(ITEM_DELAY_MS);
          continue;
        }

        // Check if already in library
        const existing = await db.query.media.findFirst({
          where: and(
            eq(media.externalId, tmdbId),
            eq(media.provider, "tmdb"),
          ),
        });

        if (existing?.inLibrary) {
          status.skipped++;
          const [skippedSyncItem] = await db.insert(syncItem).values({
            ...syncItemBase(item),
            tmdbId,
            mediaId: existing.id,
            result: "skipped",
            reason: "Already in library",
          }).returning();

          // Still fetch media info for skipped items (they exist on this server)
          if (skippedSyncItem) {
            try {
              let mediaFiles: MediaFileInfo[] = [];
              if (item.source === "jellyfin" && item.jellyfinItemId && jellyfinUrl && jellyfinKey) {
                mediaFiles = await fetchJellyfinMediaInfo(jellyfinUrl, jellyfinKey, item.jellyfinItemId, item.type);
              } else if (item.source === "plex" && item.plexRatingKey && plexUrl && plexToken) {
                mediaFiles = await fetchPlexMediaInfo(plexUrl, plexToken, item.plexRatingKey, item.type);
              }
              if (mediaFiles.length > 0) {
                await db.insert(syncEpisode).values(
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
          await updateStatus(status);
          await sleep(ITEM_DELAY_MS);
          continue;
        }

        let mediaId: string;
        if (existing) {
          await db
            .update(media)
            .set({ inLibrary: true, libraryId: item.libraryId, libraryPath: item.path, addedAt: new Date() })
            .where(eq(media.id, existing.id));
          mediaId = existing.id;
        } else {
          const normalized = await tmdb.getMetadata(tmdbId, resolvedType);
          const inserted = await persistMedia(db, normalized);
          await db
            .update(media)
            .set({ inLibrary: true, libraryId: item.libraryId, libraryPath: item.path, addedAt: new Date() })
            .where(eq(media.id, inserted.id));
          mediaId = inserted.id;
        }

        status.imported++;
        const [insertedSyncItem] = await db.insert(syncItem).values({
          ...syncItemBase(item),
          tmdbId,
          mediaId,
          result: "imported",
        }).returning();

        // Fetch media file info (resolution, codec, etc.)
        if (insertedSyncItem) {
          try {
            let mediaFiles: MediaFileInfo[] = [];
            if (item.source === "jellyfin" && item.jellyfinItemId && jellyfinUrl && jellyfinKey) {
              mediaFiles = await fetchJellyfinMediaInfo(jellyfinUrl, jellyfinKey, item.jellyfinItemId, item.type);
            } else if (item.source === "plex" && item.plexRatingKey && plexUrl && plexToken) {
              mediaFiles = await fetchPlexMediaInfo(plexUrl, plexToken, item.plexRatingKey, item.type);
            }
            if (mediaFiles.length > 0) {
              await db.insert(syncEpisode).values(
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
        await db.insert(syncItem).values({
          ...syncItemBase(item),
          tmdbId: item.tmdbId,
          result: "failed",
          reason: msg.slice(0, 500),
        });
      }

      status.processed++;
      await updateStatus(status);
      await sleep(ITEM_DELAY_MS);
    }

    if (i + BATCH_SIZE < deduplicated.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Record sync_items for duplicate items from other libraries (items filtered by dedup)
  // These are items that exist in multiple servers — record them as skipped with correct libraryId
  const processedKeys = new Set<string>();
  for (const item of deduplicated) {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title}:${item.year}`;
    processedKeys.add(`${key}:${item.libraryId}`);
  }
  for (const item of pending) {
    const key = item.tmdbId ? `tmdb:${item.tmdbId}` : `title:${item.title}:${item.year}`;
    const itemKey = `${key}:${item.libraryId}`;
    if (processedKeys.has(itemKey)) continue;
    processedKeys.add(itemKey);

    // Find the media record for this TMDB ID
    const tmdbId = item.tmdbId;
    let mediaId: string | undefined;
    if (tmdbId) {
      const existing = await db.query.media.findFirst({
        where: and(eq(media.externalId, tmdbId), eq(media.provider, "tmdb")),
      });
      mediaId = existing?.id;
    }

    await db.insert(syncItem).values({
      ...syncItemBase(item),
      tmdbId: item.tmdbId,
      mediaId: mediaId ?? null,
      result: mediaId ? "skipped" : "failed",
      reason: mediaId ? "Already in library" : "Could not resolve",
    });
  }

  status.status = "completed";
  status.completedAt = new Date().toISOString();
  await updateStatus(status);

  console.log(
    `[reverse-sync] Done. Imported: ${status.imported}, Skipped: ${status.skipped}, Failed: ${status.failed}`,
  );
}
