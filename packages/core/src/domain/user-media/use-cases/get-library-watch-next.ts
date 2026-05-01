import type { Database } from "@canto/db/client";
import type { LibraryFeedFilterOptions } from "@canto/core/domain/user-media/types/library-feed";
import { getContinueWatching } from "@canto/core/domain/user-media/use-cases/get-continue-watching";
import { getWatchNext } from "@canto/core/domain/user-media/use-cases/get-watch-next";
import type { GetWatchNextDeps } from "@canto/core/domain/user-media/use-cases/get-watch-next";

type View = "all" | "continue" | "watch_next";
type WatchStatus = "in_progress" | "completed" | "not_started";

/**
 * @deprecated Use `getContinueWatching` (view='continue') or `getWatchNext`
 * (view='watch_next') directly. This wrapper exists only to keep older clients
 * compiling for one release while the focused endpoints take over. It will be
 * removed once consumers migrate.
 *
 * Behavioural caveats during the deprecation window:
 *  - `view='continue'` always returns the first keyset page; the legacy
 *    number-based cursor is not threaded through to the new keyset pagination.
 *  - `view='all'` interleaves the first page of each focused endpoint and
 *    returns no `nextCursor` — the merged feed is no longer the canonical way
 *    to render the library hub.
 *  - `watchStatus` post-filtering is no longer applied; use the focused
 *    endpoint inputs (filter at source) instead.
 */
export interface GetLibraryWatchNextInput {
  limit: number;
  cursor?: number | null;
  view: View;
  mediaType?: "movie" | "show";
  watchStatus?: WatchStatus;
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

export interface LegacyMergedItem {
  id: string;
  kind: "continue" | "next_episode" | "next_movie" | "because_watched";
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
  source: "jellyfin" | "plex" | "trakt" | "list" | "completion";
  progressSeconds: number;
  durationSeconds: number | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "seconds" | "episodes" | null;
  watchedAt: Date | null;
  episode: {
    id: string;
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;
  fromLists: string[];
  becauseOf?: {
    mediaId: string;
    title: string;
    posterPath: string | null;
  } | null;
}

function toFilterPayload(input: GetLibraryWatchNextInput) {
  return {
    mediaType: input.mediaType,
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
}

export async function getLibraryWatchNext(
  db: Database,
  deps: GetWatchNextDeps,
  userId: string,
  input: GetLibraryWatchNextInput,
) {
  if (input.view === "continue") {
    const result = await getContinueWatching(db, deps, userId, {
      limit: input.limit,
      cursor: null,
      ...toFilterPayload(input),
    });
    const items: LegacyMergedItem[] = result.items.map((item) => ({
      ...item,
      progressUnit: item.progressUnit,
    }));
    return { items, total: items.length, nextCursor: undefined };
  }

  if (input.view === "watch_next") {
    const result = await getWatchNext(db, deps, userId, {
      limit: input.limit,
      cursor: input.cursor ?? 0,
      ...toFilterPayload(input),
    });
    const items: LegacyMergedItem[] = result.items.map((item) => ({
      ...item,
      watchedAt: item.watchedAt,
    }));
    return {
      items,
      total: items.length,
      nextCursor: result.nextCursor ?? undefined,
    };
  }

  // view === "all" — interleave the first page of each focused endpoint.
  const [continueResult, watchNextResult] = await Promise.all([
    getContinueWatching(db, deps, userId, {
      limit: input.limit,
      cursor: null,
      ...toFilterPayload(input),
    }),
    getWatchNext(db, deps, userId, {
      limit: input.limit,
      cursor: 0,
      ...toFilterPayload(input),
    }),
  ]);

  const merged: LegacyMergedItem[] = [
    ...continueResult.items.map<LegacyMergedItem>((item) => ({ ...item })),
    ...watchNextResult.items.map<LegacyMergedItem>((item) => ({ ...item })),
  ];
  const sliced = merged.slice(0, input.limit);
  return { items: sliced, total: merged.length, nextCursor: undefined };
}
