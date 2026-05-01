/* -------------------------------------------------------------------------- */
/*  Batch resolvers used by reverse-sync                                      */
/*                                                                            */
/*  Pre-load every DB row a batch of scanned items might match in 3 queries  */
/*  (media-by-refs / media-version-by-server-item-id / episode-by-numbers)   */
/*  so the per-item resolution loop is in-memory only. Used by the worker's */
/*  reverse-sync orchestrator; the domain pipeline reaches them indirectly  */
/*  through the same data already loaded into its anchor cache.              */
/* -------------------------------------------------------------------------- */

import { and, eq, inArray, or } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { episode, media, mediaVersion, season } from "@canto/db/schema";

import type { ServerSource } from "@canto/core/domain/sync/types";

type MediaRow = typeof media.$inferSelect;
type MediaVersionRow = typeof mediaVersion.$inferSelect;

interface RefLookup {
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
}

/**
 * Result of pre-loading every media row a batch of scanned items might match.
 * Keyed by each candidate identifier so per-item resolution becomes a series
 * of `Map.get` calls.
 */
export interface BatchedMediaRefs {
  byTmdb: Map<number, MediaRow>;
  byImdb: Map<string, MediaRow>;
  byTvdb: Map<number, MediaRow>;
  /**
   * Edge-case rows where the TMDB id we're looking up matches a TVDB-provider
   * row's `tvdbId` cross-reference. Mirrors the fifth branch of
   * `findMediaByAnyReference`.
   */
  byTmdbAsTvdbXref: Map<number, MediaRow>;
}

/**
 * Given a set of scanned items, run a single batched query per index path
 * (tmdb / imdb / tvdb / tvdb-xref-of-tmdb) and bucket the rows into Maps.
 * Replaces N×5 sequential `findMediaByAnyReference` calls with 4 SELECTs that
 * each hit a dedicated index.
 */
export async function batchResolveMediaByExternalRefs(
  db: Database,
  refs: readonly RefLookup[],
): Promise<BatchedMediaRefs> {
  const tmdbIds = new Set<number>();
  const imdbIds = new Set<string>();
  const tvdbIds = new Set<number>();

  for (const ref of refs) {
    if (ref.tmdbId) tmdbIds.add(ref.tmdbId);
    if (ref.imdbId) imdbIds.add(ref.imdbId);
    if (ref.tvdbId) tvdbIds.add(ref.tvdbId);
  }

  const result: BatchedMediaRefs = {
    byTmdb: new Map(),
    byImdb: new Map(),
    byTvdb: new Map(),
    byTmdbAsTvdbXref: new Map(),
  };

  if (tmdbIds.size === 0 && imdbIds.size === 0 && tvdbIds.size === 0) {
    return result;
  }

  const tmdbIdList = [...tmdbIds];
  const imdbIdList = [...imdbIds];
  const tvdbIdList = [...tvdbIds];

  const conditions = [];
  if (tmdbIdList.length > 0) {
    conditions.push(
      and(eq(media.provider, "tmdb"), inArray(media.externalId, tmdbIdList)),
    );
  }
  if (imdbIdList.length > 0) {
    conditions.push(inArray(media.imdbId, imdbIdList));
  }
  if (tvdbIdList.length > 0) {
    conditions.push(inArray(media.tvdbId, tvdbIdList));
  }
  if (tmdbIdList.length > 0) {
    conditions.push(
      and(eq(media.provider, "tvdb"), inArray(media.tvdbId, tmdbIdList)),
    );
  }

  if (conditions.length === 0) return result;

  const rows = await db
    .select()
    .from(media)
    .where(or(...conditions));

  const tmdbSet = new Set(tmdbIdList);
  const imdbSet = new Set(imdbIdList);
  const tvdbSet = new Set(tvdbIdList);

  for (const row of rows) {
    if (
      row.provider === "tmdb" &&
      row.externalId !== null &&
      tmdbSet.has(row.externalId)
    ) {
      result.byTmdb.set(row.externalId, row);
    }
    if (row.imdbId && imdbSet.has(row.imdbId)) {
      if (!result.byImdb.has(row.imdbId)) result.byImdb.set(row.imdbId, row);
    }
    if (row.tvdbId !== null && tvdbSet.has(row.tvdbId)) {
      if (!result.byTvdb.has(row.tvdbId)) result.byTvdb.set(row.tvdbId, row);
    }
    if (
      row.provider === "tvdb" &&
      row.tvdbId !== null &&
      tmdbSet.has(row.tvdbId)
    ) {
      if (!result.byTmdbAsTvdbXref.has(row.tvdbId)) {
        result.byTmdbAsTvdbXref.set(row.tvdbId, row);
      }
    }
  }

  return result;
}

/**
 * Lookup a single item against the batched maps, preserving the legacy
 * `findMediaByAnyReference` precedence: direct → imdb → tvdb → tvdb-as-tmdb.
 */
export function findMediaInRefs(
  maps: BatchedMediaRefs,
  ref: RefLookup,
): MediaRow | null {
  if (ref.tmdbId) {
    const row = maps.byTmdb.get(ref.tmdbId);
    if (row) return row;
  }
  if (ref.imdbId) {
    const row = maps.byImdb.get(ref.imdbId);
    if (row) return row;
  }
  if (ref.tvdbId) {
    const row = maps.byTvdb.get(ref.tvdbId);
    if (row) return row;
  }
  if (ref.tmdbId) {
    const row = maps.byTmdbAsTvdbXref.get(ref.tmdbId);
    if (row) return row;
  }
  return null;
}

/**
 * Pre-load media_version rows for a batch of (source, serverItemId) pairs.
 * Single SELECT that uses `uq_media_version_source_server_item`, replacing
 * N sequential `findMediaVersionBySourceAndServerItemId` calls.
 */
export async function batchResolveMediaVersionsByServerItemIds(
  db: Database,
  source: ServerSource,
  serverItemIds: readonly string[],
): Promise<Map<string, MediaVersionRow>> {
  const result = new Map<string, MediaVersionRow>();
  if (serverItemIds.length === 0) return result;

  const rows = await db
    .select()
    .from(mediaVersion)
    .where(
      and(
        eq(mediaVersion.source, source),
        inArray(mediaVersion.serverItemId, [...new Set(serverItemIds)]),
      ),
    );

  for (const row of rows) {
    result.set(row.serverItemId, row);
  }

  return result;
}

/**
 * Nested map: mediaId → seasonNumber → episodeNumber → episodeId. Built from
 * a single JOIN of season + episode for every show mediaId in the batch.
 * Per-item lookup in the sync loop becomes three Map gets.
 */
export type EpisodeIdMap = Map<string, Map<number, Map<number, string>>>;

export async function batchResolveEpisodesByMediaAndNumbers(
  db: Database,
  mediaIds: readonly string[],
): Promise<EpisodeIdMap> {
  const result: EpisodeIdMap = new Map();
  if (mediaIds.length === 0) return result;

  const rows = await db
    .select({
      mediaId: season.mediaId,
      seasonNumber: season.number,
      episodeNumber: episode.number,
      episodeId: episode.id,
    })
    .from(episode)
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(inArray(season.mediaId, [...new Set(mediaIds)]));

  for (const row of rows) {
    let bySeason = result.get(row.mediaId);
    if (!bySeason) {
      bySeason = new Map();
      result.set(row.mediaId, bySeason);
    }
    let byEpisode = bySeason.get(row.seasonNumber);
    if (!byEpisode) {
      byEpisode = new Map();
      bySeason.set(row.seasonNumber, byEpisode);
    }
    byEpisode.set(row.episodeNumber, row.episodeId);
  }

  return result;
}

export function findEpisodeIdInMap(
  map: EpisodeIdMap,
  mediaId: string,
  seasonNumber: number,
  episodeNumber: number,
): string | null {
  return map.get(mediaId)?.get(seasonNumber)?.get(episodeNumber) ?? null;
}
