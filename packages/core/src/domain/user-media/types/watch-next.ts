import type { LibraryFeedFilterOptions } from "../../../infra/repositories";

export interface GetWatchNextInput {
  limit: number;
  cursor?: number | null;
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

export type WatchNextKind = "next_episode" | "next_movie" | "because_watched";

export interface WatchNextBecauseOf {
  mediaId: string;
  title: string;
  posterPath: string | null;
}

export interface WatchNextItem {
  id: string;
  kind: WatchNextKind;
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
  source: "list" | "completion";
  progressSeconds: 0;
  durationSeconds: null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "episodes" | null;
  watchedAt: Date;
  episode: {
    id: string;
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;
  fromLists: string[];
  becauseOf: WatchNextBecauseOf | null;
}

export interface GetWatchNextResult {
  items: WatchNextItem[];
  nextCursor: number | null;
}
