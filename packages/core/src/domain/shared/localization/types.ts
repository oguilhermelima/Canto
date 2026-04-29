/** ISO BCP-47 language tag, e.g. "en-US", "pt-BR". */
export type LocaleCode = string;

/** Origin of a localization payload. */
export type LocalizationSource = "tmdb" | "tvdb" | "original" | "manual";

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
