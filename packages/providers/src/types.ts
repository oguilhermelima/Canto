export type MediaType = "movie" | "show";
export type ProviderName = "tmdb" | "anilist" | "tvdb";

export interface SearchResult {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
  title: string;
  originalTitle?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  year?: number;
  voteAverage?: number;
  voteCount?: number;
  popularity?: number;
  genreIds?: number[];
  originalLanguage?: string;
}

export interface NormalizedSeason {
  number: number;
  externalId?: number;
  name?: string;
  overview?: string;
  airDate?: string;
  posterPath?: string;
  episodeCount?: number;
  seasonType?: string;
  episodes?: NormalizedEpisode[];
}

export interface NormalizedEpisode {
  number: number;
  externalId?: number;
  title?: string;
  overview?: string;
  airDate?: string;
  runtime?: number;
  stillPath?: string;
  voteAverage?: number;
  absoluteNumber?: number;
  finaleType?: string;
}

export interface Translation {
  language: string; // "pt-BR", "es-ES", etc.
  title?: string;
  overview?: string;
  tagline?: string;
  posterPath?: string;
  logoPath?: string;
}

export interface SeasonTranslation {
  seasonNumber: number;
  language: string;
  name?: string;
  overview?: string;
}

export interface EpisodeTranslation {
  seasonNumber: number;
  episodeNumber: number;
  language: string;
  title?: string;
  overview?: string;
}

export interface NormalizedMedia {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
  title: string;
  originalTitle?: string;
  overview?: string;
  tagline?: string;
  releaseDate?: string;
  year?: number;
  lastAirDate?: string;
  status?: string;
  genres: string[];
  genreIds?: number[];
  contentRating?: string;
  originalLanguage?: string;
  spokenLanguages?: string[];
  originCountry?: string[];
  voteAverage?: number;
  voteCount?: number;
  popularity?: number;
  runtime?: number;
  posterPath?: string;
  backdropPath?: string;
  logoPath?: string;
  imdbId?: string;
  tvdbId?: number;
  // TV
  seasons?: NormalizedSeason[];
  networks?: string[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  inProduction?: boolean;
  nextAirDate?: string;
  // Movie
  budget?: number;
  revenue?: number;
  collection?: { id: number; name: string; posterPath?: string } | null;
  // Shared
  productionCompanies?: { id: number; name: string; logoPath?: string }[];
  productionCountries?: string[];
  // Translations
  translations?: Translation[];
  seasonTranslations?: SeasonTranslation[];
  episodeTranslations?: EpisodeTranslation[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath?: string;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePath?: string;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  language?: string;
}

export interface WatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string;
}

export interface WatchProvidersByRegion {
  [region: string]: {
    link?: string;
    flatrate?: WatchProvider[];
    rent?: WatchProvider[];
    buy?: WatchProvider[];
  };
}

export interface MediaExtras {
  credits: { cast: CastMember[]; crew: CrewMember[] };
  similar: SearchResult[];
  recommendations: SearchResult[];
  videos: Video[];
  watchProviders?: WatchProvidersByRegion;
}

export interface PersonCredit {
  id: number;
  title: string;
  character?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  year?: number;
  voteAverage?: number;
  mediaType: "movie" | "show";
}

export interface PersonDetail {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  knownForDepartment: string | null;
  alsoKnownAs: string[];
  gender: number;
  popularity: number;
  images: { filePath: string; aspectRatio: number }[];
  movieCredits: PersonCredit[];
  tvCredits: PersonCredit[];
}

export interface SearchOpts {
  page?: number;
  language?: string;
  region?: string;
}

export interface DiscoverOpts {
  page?: number;
  with_genres?: string;
  with_original_language?: string;
  sort_by?: string;
  first_air_date_gte?: string;
  release_date_gte?: string;
  with_keywords?: string;
  vote_average_gte?: number;
  with_runtime_lte?: number;
  first_air_date_lte?: string;
  release_date_lte?: string;
  certification?: string;
  certification_country?: string;
  with_status?: string;
  with_watch_providers?: string;
  watch_region?: string;
  with_runtime_gte?: number;
}

export interface MetadataOpts {
  supportedLanguages?: string[];
}

export interface MetadataProvider {
  name: ProviderName;
  getMetadata(
    externalId: number,
    type: MediaType,
    opts?: MetadataOpts,
  ): Promise<NormalizedMedia>;
  search(
    query: string,
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }>;
  getExtras(
    externalId: number,
    type: MediaType,
  ): Promise<MediaExtras>;
  getTrending(
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }>;
  discover(
    type: MediaType,
    opts?: DiscoverOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }>;
}
