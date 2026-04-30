import type { MediaId } from "@canto/core/domain/media/types/media";

/** ISO BCP-47 language tag (e.g. `en-US`, `pt-BR`). Mirrors the `language`
 *  column on `media_localization`. */
export type LocaleCode = string;

/** Origin of a localization payload. */
export type LocalizationSource = "tmdb" | "tvdb" | "original" | "manual";

/**
 * Domain entity for a `media_localization` row. The composite primary key is
 * `(mediaId, language)` — there is no surrogate id. After Phase 1C-δ this is
 * the canonical home for per-language `title`/`overview`/`tagline`/
 * `posterPath`/`logoPath`/`trailerKey` (the base `media` row no longer
 * carries them).
 */
export interface MediaLocalization {
  mediaId: MediaId;
  language: LocaleCode;
  title: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  logoPath: string | null;
  trailerKey: string | null;
  source: LocalizationSource;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Insert payload for a localization upsert. `title` is required (non-null in
 * the schema); every other column may be null. The repository is responsible
 * for applying COALESCE-style merge semantics so partial updates don't blow
 * away previously-stored fields.
 */
export interface NewMediaLocalization {
  mediaId: MediaId | string;
  language: LocaleCode;
  title: string;
  overview?: string | null;
  tagline?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
  trailerKey?: string | null;
  source: LocalizationSource;
}

/**
 * Caller-facing payload for the localized fields of a single media row. The
 * repository wraps this in a `NewMediaLocalization` (adding `mediaId`,
 * `language`, `source`) before writing.
 */
export interface MediaLocalizationPayload {
  title: string;
  overview?: string | null;
  tagline?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
  trailerKey?: string | null;
}

export interface SeasonLocalizationPayload {
  name?: string | null;
  overview?: string | null;
}

export interface EpisodeLocalizationPayload {
  title?: string | null;
  overview?: string | null;
}

/**
 * Localized listing projection: the structural columns from `media` plus the
 * COALESCE'd user-lang/en-US localization. Returned by the read helpers on
 * the port. Mirrors the legacy `LocalizedMedia` shape from
 * `domain/shared/localization`.
 */
export interface LocalizedMedia {
  // Structural — sourced from `media`
  id: string;
  type: string;
  externalId: number;
  provider: string;
  originalTitle: string | null;
  originalLanguage: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  lastAirDate: string | null;
  status: string | null;
  genres: string[] | null;
  contentRating: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  runtime: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  inProduction: boolean | null;

  // Resolved per-language
  title: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  logoPath: string | null;
  trailerKey: string | null;
}

export interface LocalizedSeason {
  id: string;
  mediaId: string;
  number: number;
  posterPath: string | null;
  airDate: string | null;
  episodeCount: number | null;
  voteAverage: number | null;

  // Resolved per-language
  name: string | null;
  overview: string | null;
}

export interface LocalizedEpisode {
  id: string;
  seasonId: string;
  number: number;
  externalId: number | null;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;

  // Resolved per-language
  title: string | null;
  overview: string | null;
}

/** External-key lookup tuple used by the batch resolver when callers don't
 *  carry an internal media UUID. */
export interface ExternalMediaRef {
  externalId: number;
  provider: string;
  type: string;
}
