import type { SeasonId } from "@canto/core/domain/media/types/season";

/** Branded id for the `episode` table primary key. */
export type EpisodeId = string & { readonly __brand: "EpisodeId" };

/**
 * Domain entity for an episode row. Like `Season`, the localized columns
 * (`title`, `overview`, `stillPath`) on the base `episode` table are
 * legacy — `episode_localization` is canonical post-1C-δ. Localization
 * overlay happens at the listing-port layer (Wave 9B).
 */
export interface Episode {
  id: EpisodeId;
  seasonId: SeasonId;
  number: number;
  externalId: number | null;
  title: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  absoluteNumber: number | null;
  finaleType: string | null;
  episodeType: string | null;
  crew:
    | Array<{
        name: string;
        job: string;
        department?: string;
        profilePath?: string;
      }>
    | null;
  guestStars:
    | Array<{ name: string; character?: string; profilePath?: string }>
    | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Insert shape — seasonId + number are required (composite uniqueness). */
export interface NewEpisode {
  seasonId: SeasonId | string;
  number: number;
  externalId?: number | null;
  title?: string | null;
  overview?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  stillPath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  absoluteNumber?: number | null;
  finaleType?: string | null;
  episodeType?: string | null;
  crew?:
    | Array<{
        name: string;
        job: string;
        department?: string;
        profilePath?: string;
      }>
    | null;
  guestStars?:
    | Array<{ name: string; character?: string; profilePath?: string }>
    | null;
}

/** Patch shape for partial episode updates (e.g. TMDB still / vote
 *  overlay onto a TVDB-sourced row). */
export type EpisodePatch = Partial<Omit<NewEpisode, "seasonId" | "number">>;

/**
 * Cross-table projection: episode number tuples used by playback resolution.
 * `findEpisodeNumbersById` returns this so callers (Trakt sync, playback push)
 * can re-derive `(seasonNumber, episodeNumber)` from a bare episode id.
 */
export interface EpisodeNumberRef {
  seasonNumber: number;
  episodeNumber: number;
}
