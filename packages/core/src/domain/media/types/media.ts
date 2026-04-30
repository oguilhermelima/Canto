/** Branded id for the `media` table primary key. */
export type MediaId = string & { readonly __brand: "MediaId" };

/** Discriminator for movie vs show. */
export type MediaType = "movie" | "show";

/** Provider that originally sourced this row. After Phase 1C-δ a media row
 *  can be cross-referenced via `imdbId` / `tvdbId` regardless of which
 *  provider seeded it; the `provider` field tracks the canonical seed. */
export type MediaProvider = "tmdb" | "tvdb" | "anilist";

/**
 * "Library" status drives whether a row appears in the user library, whether
 * downloaded files are tracked locally, and the continuous-download flag.
 */
export interface MediaLibraryFlags {
  inLibrary: boolean;
  downloaded: boolean;
  continuousDownload: boolean;
  libraryId: string | null;
  libraryPath: string | null;
  addedAt: Date | null;
}

/**
 * Domain entity for a media row. Mirrors the schema 1:1 with branded
 * `MediaId`; mappers handle the conversion at the infra boundary.
 *
 * After Phase 1C-δ, per-language `title` / `overview` / `tagline` /
 * `posterPath` / `logoPath` live on `media_localization` and are NOT on this
 * type — listing readers overlay them via JOIN and surface a `LocalizedMedia`
 * shape that's tracked separately (see localization helpers in
 * `domain/shared/localization`).
 */
export interface Media {
  id: MediaId;
  type: MediaType;
  externalId: number;
  provider: MediaProvider;

  originalTitle: string | null;

  // Dates
  releaseDate: string | null;
  year: number | null;
  lastAirDate: string | null;

  // Classification
  status: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
  contentRating: string | null;
  originalLanguage: string | null;
  spokenLanguages: string[] | null;
  originCountry: string[] | null;

  // Metrics
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  runtime: number | null;

  // Images (language-agnostic only; poster/logo live on media_localization)
  backdropPath: string | null;

  // External IDs
  imdbId: string | null;
  tvdbId: number | null;

  // Per-media provider override (null = follow global setting)
  overrideProviderFor: string | null;

  // TV-specific
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  inProduction: boolean | null;
  networks: string[] | null;

  // Movie-specific
  budget: number | null;
  revenue: number | null;
  collection: {
    id: number;
    name: string;
    posterPath?: string;
  } | null;

  // Production
  productionCompanies:
    | { id: number; name: string; logoPath?: string }[]
    | null;
  productionCountries: string[] | null;

  // Library state
  libraryId: string | null;
  inLibrary: boolean;
  downloaded: boolean;
  libraryPath: string | null;
  addedAt: Date | null;
  continuousDownload: boolean;

  // Refresh strategy
  nextAirDate: string | null;
  airsTime: string | null;
  downloadProfileId: string | null;

  // Processing pipeline status
  processingStatus: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Slim projection used by listings, batch resolvers, and brief reads. The
 * heavy localization overlay only happens at the listing-port boundary
 * (Wave 9B) — this shape is the post-1C-δ source row without the user-lang
 * COALESCE applied.
 */
export interface MediaSummary {
  id: MediaId;
  type: MediaType;
  externalId: number;
  provider: MediaProvider;
  year: number | null;
  voteAverage: number | null;
  posterPath: string | null;
  backdropPath: string | null;
}

/**
 * Input shape for inserting a new media row. Mirrors the schema's
 * `$inferInsert` minus the columns Drizzle defaults (`id`, `createdAt`,
 * `updatedAt`, `inLibrary`, `downloaded`, `processingStatus`,
 * `continuousDownload`).
 */
export interface NewMedia {
  type: MediaType;
  externalId: number;
  provider: MediaProvider;
  originalTitle?: string | null;
  releaseDate?: string | null;
  year?: number | null;
  lastAirDate?: string | null;
  status?: string | null;
  genres?: string[] | null;
  genreIds?: number[] | null;
  contentRating?: string | null;
  originalLanguage?: string | null;
  spokenLanguages?: string[] | null;
  originCountry?: string[] | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  popularity?: number | null;
  runtime?: number | null;
  backdropPath?: string | null;
  imdbId?: string | null;
  tvdbId?: number | null;
  overrideProviderFor?: string | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  inProduction?: boolean | null;
  networks?: string[] | null;
  budget?: number | null;
  revenue?: number | null;
  collection?: {
    id: number;
    name: string;
    posterPath?: string;
  } | null;
  productionCompanies?:
    | { id: number; name: string; logoPath?: string }[]
    | null;
  productionCountries?: string[] | null;
  libraryId?: string | null;
  inLibrary?: boolean;
  downloaded?: boolean;
  libraryPath?: string | null;
  addedAt?: Date | null;
  continuousDownload?: boolean;
  nextAirDate?: string | null;
  airsTime?: string | null;
  downloadProfileId?: string | null;
  processingStatus?: string;
}

/** Patch shape for `updateMedia` — every field optional, `updatedAt`
 *  is bumped automatically by the adapter. */
export type UpdateMediaInput = Partial<NewMedia>;

/**
 * Library "brief" projection — id + cross-reference fields only. Used by
 * recommendation seed loaders and batch reverse-sync resolvers. Cheaper
 * than `MediaSummary` because it skips imagery and metrics.
 */
export interface LibraryMediaBrief {
  id: MediaId;
  externalId: number;
  provider: MediaProvider;
  type: MediaType;
}

/** External-id pair returned by `findLibraryExternalIds`. */
export interface LibraryExternalIdRef {
  externalId: number;
  provider: MediaProvider;
}

/** Aggregate stats shape. `storageBytes` comes from media_file (Wave 8) so
 *  the JOIN crosses contexts — kept on this port for now since it's a single
 *  read used by the library overview screen. */
export interface LibraryStats {
  total: number;
  movies: number;
  shows: number;
  storageBytes: bigint;
}

/**
 * Library listing projection used by `MediaRepositoryPort.listLibraryMedia`.
 * Extends the base `Media` row with the user-language overlay applied
 * inline via `media_localization`. Wave 9C2 promoted the legacy
 * `listLibraryMedia` infra helper to a port method so consumers no
 * longer reach into infra; the projection mirrors the legacy shape
 * field-for-field so callers stay drop-in.
 */
export interface LibraryMediaItem extends Media {
  title: string;
  overview: string | null;
  posterPath: string | null;
  logoPath: string | null;
  tagline: string | null;
}

/** Page response wrapping `LibraryMediaItem[]` with pagination metadata. */
export interface LibraryMediaPage {
  items: LibraryMediaItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Tiny projection of shows monitored for continuous-download RSS — only
 * what the matcher and scoring layer need (id/title/externalId/provider/
 * type plus the flavor-derivation columns). Matches the legacy
 * `findMonitoredShowsForRss` shape.
 */
export interface MonitoredShowForRss {
  id: string;
  title: string;
  externalId: number;
  provider: string;
  type: string;
  originCountry: string[] | null;
  originalLanguage: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
}

/** `(id, title)` projection used by the `validate-downloads` worker. */
export interface DownloadedLibraryMedia {
  id: string;
  title: string;
}

/**
 * Filter shape for `MediaRepositoryPort.findEligibleForEnrichment`. Used by
 * the `ensureMediaMany` orchestrator to enumerate the rows the bulk
 * gap-detection sweep should iterate over.
 */
export interface EnrichmentEligibilityFilter {
  mediaIds?: string[];
  type?: MediaType;
  hasTvdbId?: boolean;
  onlyInLibrary?: boolean;
}

/** Tiny `(id, type, tvdbId)` projection returned by
 *  `findEligibleForEnrichment`. Matches the columns the orchestrator needs
 *  to drive `detectGaps` per row. */
export interface EnrichmentEligibility {
  id: string;
  type: MediaType;
  tvdbId: number | null;
}
