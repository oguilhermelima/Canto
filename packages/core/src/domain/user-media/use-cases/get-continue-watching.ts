import type { Database } from "@canto/db/client";
import {
  findContinueWatchingFeed
  
  
  
} from "@canto/core/infra/user-media/library-feed-repository";
import type { ContinueWatchingFeedRow, ContinueWatchingKeysetCursor, LibraryFeedFilterOptions } from "@canto/core/domain/user-media/types/library-feed";
import { findTrailerKeysForMediaIds } from "@canto/core/infra/content-enrichment/extras-repository";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";
import {
  toDurationSeconds,
  toProgressPercent,
} from "@canto/core/domain/user-media/rules/user-media-rules";

export interface GetContinueWatchingInput {
  limit: number;
  cursor?: ContinueWatchingKeysetCursor | null;
  mediaType?: "movie" | "show";
  q?: string;
  source?: LibraryFeedFilterOptions["source"];
  yearMin?: number;
  yearMax?: number;
  genreIds?: number[];
  sortBy?: LibraryFeedFilterOptions["sortBy"];
  scoreMin?: number;
  scoreMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  language?: string;
  certification?: string;
  tvStatus?: string;
}

export interface ContinueWatchingItem {
  id: string;
  kind: "continue";
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  trailerKey: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  source: "jellyfin" | "plex" | "trakt";
  progressSeconds: number;
  durationSeconds: number | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "seconds";
  watchedAt: Date;
  episode: {
    id: string;
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;
  fromLists: string[];
}

export interface GetContinueWatchingResult {
  items: ContinueWatchingItem[];
  nextCursor: ContinueWatchingKeysetCursor | null;
}

/**
 * Continue Watching feed — actively-playing items from Jellyfin/Plex/Trakt.
 *
 * Replaces the `getLibraryWatchNext` slow path for the "continue" view.
 * The query is keyset-paginated on (lastWatchedAt, id) and the source/
 * isCompleted/position predicates are pushed into SQL, so we read at most
 * `limit + 1` rows even when the user has thousands of progress entries.
 */
export async function getContinueWatching(
  db: Database,
  userId: string,
  input: GetContinueWatchingInput,
): Promise<GetContinueWatchingResult> {
  const limit = input.limit;
  const filters: LibraryFeedFilterOptions = {
    q: input.q,
    source: input.source,
    yearMin: input.yearMin,
    yearMax: input.yearMax,
    genreIds: input.genreIds,
    sortBy: input.sortBy,
    scoreMin: input.scoreMin,
    scoreMax: input.scoreMax,
    runtimeMin: input.runtimeMin,
    runtimeMax: input.runtimeMax,
    language: input.language,
    certification: input.certification,
    tvStatus: input.tvStatus,
  };

  const userLang = await getUserLanguage(db, userId);

  // Fetch limit + 1 so we can derive the next cursor without a count query.
  const rows = await findContinueWatchingFeed(db, userId, userLang, {
    limit: limit + 1,
    cursor: input.cursor ?? null,
    mediaType: input.mediaType,
    filters,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Dedupe by mediaId so the same show only appears once even when several
  // episodes have lingering progress rows. The rows are already ordered by
  // (lastWatchedAt DESC, id DESC), so the first row per media is the most
  // recently active one — exactly what we want.
  const seenMedia = new Set<string>();
  const dedupedRows: ContinueWatchingFeedRow[] = [];
  for (const row of pageRows) {
    if (seenMedia.has(row.mediaId)) continue;
    seenMedia.add(row.mediaId);
    dedupedRows.push(row);
  }

  // Batch-load trailer keys instead of pulling them via the per-row
  // correlated subquery in mediaI18n.trailerKey.
  const trailerByMediaId = await findTrailerKeysForMediaIds(
    db,
    dedupedRows.map((row) => row.mediaId),
  );

  const items = dedupedRows.map((row): ContinueWatchingItem => {
    const durationSeconds = toDurationSeconds(
      row.episodeRuntime ?? row.mediaRuntime,
    );
    return {
      id: `continue:${row.id}`,
      kind: "continue",
      mediaId: row.mediaId,
      mediaType: row.mediaType,
      title: row.title,
      posterPath: row.posterPath,
      backdropPath: row.backdropPath,
      logoPath: row.logoPath,
      overview: row.overview,
      voteAverage: row.voteAverage,
      genres: row.genres,
      genreIds: row.genreIds,
      trailerKey: trailerByMediaId.get(row.mediaId) ?? null,
      year: row.year,
      externalId: row.externalId,
      provider: row.provider,
      source: row.source,
      progressSeconds: row.positionSeconds,
      durationSeconds,
      progressPercent:
        durationSeconds !== null
          ? toProgressPercent(row.positionSeconds, durationSeconds)
          : null,
      progressValue: row.positionSeconds,
      progressTotal: durationSeconds,
      progressUnit: "seconds",
      watchedAt: row.lastWatchedAt,
      episode: row.episodeId
        ? {
            id: row.episodeId,
            seasonNumber: row.seasonNumber,
            number: row.episodeNumber,
            title: row.episodeTitle,
          }
        : null,
      fromLists: [],
    };
  });

  // Cursor sourced from the LAST row of the requested page (not the dedupe
  // result) so pagination can't skip rows when a media has multiple progress
  // entries that span page boundaries.
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor: ContinueWatchingKeysetCursor | null =
    hasMore && lastRow
      ? { lastWatchedAt: lastRow.lastWatchedAt, id: lastRow.id }
      : null;

  return { items, nextCursor };
}
