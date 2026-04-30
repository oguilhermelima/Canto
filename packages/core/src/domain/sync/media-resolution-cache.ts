/* -------------------------------------------------------------------------- */
/*  Media resolution cache                                                    */
/*                                                                            */
/*  Two flavors of "memoize media resolution":                                */
/*                                                                            */
/*  1. Batch loaders — pre-load every DB row needed for a sync run in 3       */
/*     queries (media-by-refs, media-version-by-server-item-id, episode-by-   */
/*     numbers) so the per-item loop hits memory only.                        */
/*                                                                            */
/*  2. Anchor cache — a per-run Map<tmdbId, ResolvedMediaAnchor> to dedupe    */
/*     resolution work across items that share a tmdbId (e.g. a Plex 1080p    */
/*     and a Jellyfin 4K of the same movie). Used by sync-pipeline; exported  */
/*     from here so both call sites share the canonical type.                 */
/*                                                                            */
/*  Reverse-sync uses the batch loaders. The full sync-pipeline uses the      */
/*  anchor cache (it goes through TMDB resolution first, then ensureMedia).   */
/* -------------------------------------------------------------------------- */

import { and, eq, inArray, or } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { episode, media, mediaVersion, season } from "@canto/db/schema";
import type { ServerSource } from "./types";

/* -------------------------------------------------------------------------- */
/*  Anchor cache (used by sync-pipeline)                                       */
/* -------------------------------------------------------------------------- */

export interface ResolvedMediaAnchor {
  mediaId: string;
  tmdbId: number;
  isNewImport: boolean;
}

/** Per-run memoization keyed by canonical TMDB id. */
export type MediaAnchorCache = Map<number, ResolvedMediaAnchor>;

export function createMediaAnchorCache(): MediaAnchorCache {
  return new Map();
}

/* -------------------------------------------------------------------------- */
/*  Batch loader: media by external references                                 */
/* -------------------------------------------------------------------------- */

type MediaRow = typeof media.$inferSelect;

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

interface RefLookup {
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
}

/**
 * Given a set of scanned items, run a single batched query per index path
 * (tmdb / imdb / tvdb / tvdb-xref-of-tmdb) and bucket the rows into Maps.
 * Replaces N×5 sequential `findMediaByAnyReference` calls with 4 SELECTs that
 * each hit a dedicated index.
 *
 * The order of fallback paths in `findMediaInRefs` mirrors the legacy
 * `findMediaByAnyReference` so behavior is byte-equivalent.
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

  // One round-trip across the four lookup paths. Each clause hits a distinct
  // index (idx_media_external for tmdb, idx_media_imdb_id for imdb, idx_media_tvdb_id
  // for tvdb). Postgres should plan as a BitmapOr.
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
    // Mirrors findMediaByAnyReference branch 5: a TVDB-provider row whose
    // `tvdbId` cross-ref equals our scanned TMDB id.
    conditions.push(
      and(eq(media.provider, "tvdb"), inArray(media.tvdbId, tmdbIdList)),
    );
  }

  if (conditions.length === 0) return result;

  const rows = await db
    .select()
    .from(media)
    .where(or(...conditions));

  // Bucket the rows. Order matters: rows can match multiple paths (e.g. a
  // TMDB row that happens to have an imdbId we're also looking up). The
  // direct match wins, which is enforced by `findMediaInRefs` consulting
  // byTmdb first.
  const tmdbSet = new Set(tmdbIdList);
  const imdbSet = new Set(imdbIdList);
  const tvdbSet = new Set(tvdbIdList);

  for (const row of rows) {
    if (
      row.provider === "tmdb" &&
      row.externalId != null &&
      tmdbSet.has(row.externalId)
    ) {
      result.byTmdb.set(row.externalId, row);
    }
    if (row.imdbId && imdbSet.has(row.imdbId)) {
      // First write wins — duplicate imdb hits across providers shouldn't
      // happen in practice, but we don't want to flap if they do.
      if (!result.byImdb.has(row.imdbId)) result.byImdb.set(row.imdbId, row);
    }
    if (row.tvdbId != null && tvdbSet.has(row.tvdbId)) {
      if (!result.byTvdb.has(row.tvdbId)) result.byTvdb.set(row.tvdbId, row);
    }
    if (
      row.provider === "tvdb" &&
      row.tvdbId != null &&
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

/* -------------------------------------------------------------------------- */
/*  Batch loader: media versions by (source, serverItemId)                     */
/* -------------------------------------------------------------------------- */

type MediaVersionRow = typeof mediaVersion.$inferSelect;

/**
 * Pre-load media_version rows for a batch of (source, serverItemId) pairs.
 * Single SELECT that uses `uq_media_version_source_server_item`, replacing
 * N sequential `findMediaVersionBySourceAndServerItemId` calls.
 *
 * Returns a Map keyed by `serverItemId`. Callers must already have filtered
 * by source before passing the IDs in.
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

/* -------------------------------------------------------------------------- */
/*  Batch loader: episodes by (mediaId, seasonNumber, episodeNumber)           */
/* -------------------------------------------------------------------------- */

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
