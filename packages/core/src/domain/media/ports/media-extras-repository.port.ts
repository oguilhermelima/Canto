import type {
  MediaCredit,
  NewMediaCredit,
} from "@canto/core/domain/media/types/media-credit";
import type {
  MediaVideo,
  NewMediaVideo,
} from "@canto/core/domain/media/types/media-video";
import type {
  MediaWatchProvider,
  NewMediaWatchProvider,
  WatchProviderLink,
} from "@canto/core/domain/media/types/media-watch-provider";
import type {
  MediaRecommendation,
  NewMediaRecommendation,
  RecommendationSourceType,
} from "@canto/core/domain/media/types/media-recommendation";
import type {
  NewTmdbCertification,
  TmdbCertificationType,
} from "@canto/core/domain/media/types/tmdb-certification";
import type { LocaleCode } from "@canto/core/domain/media/types/media-localization";
import type { RecsFilters } from "@canto/core/domain/recommendations/types/recs-filters";

/**
 * Localized projection used by the recommendation listing helpers. The same
 * `LocalizedMedia`-style shape the localization port emits, with the
 * additional `genreIds` / `originalLanguage` columns the recommendation
 * filters key on.
 */
export interface LocalizedRecommendationItem {
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
  genreIds: number[] | null;
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
  /* Resolved per-language */
  title: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  logoPath: string | null;
  /** Trailer key joined post-query for the global-recs endpoint. */
  trailerKey?: string | null;
}

/** Listing item for the `findRecommendationsBySource` helper — narrower
 *  projection that only needs id + cross-ref + a handful of localized cols. */
export interface RecommendationSourceItem {
  id: string;
  externalId: number;
  provider: string;
  mediaType: string;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
}

/**
 * Single port covering the per-media extras tables (`media_credit`,
 * `media_video`, `media_watch_provider`, `media_recommendation`) plus the
 * TMDB-global lookup tables (`watch_provider_link`, `tmdb_certification`).
 *
 * Wave 9C scope: every operation that touches *only* these tables surfaces
 * here. Reads that JOIN with `media` for recommendation listings keep the
 * localization overlay inline (the listing is keyed on `media.id`, but the
 * resolver expects per-language `title` / `overview` / `posterPath` /
 * `logoPath` already merged), so they continue to project a
 * `LocalizedRecommendationItem` shape.
 *
 * Phase 5.5 will fold this port into the broader media context — keeping it
 * scoped narrowly today makes that future merge trivial.
 */
export interface MediaExtrasRepositoryPort {
  // ─── Credits (cast / crew) ───

  /** Read every credit for a media, ordered by `order ASC`. */
  findCreditsByMediaId(mediaId: string): Promise<MediaCredit[]>;

  /** Hard delete every credit row for a media. Used before the bulk
   *  re-insert in `persistExtras` / `refreshExtras`. */
  deleteCreditsByMediaId(mediaId: string): Promise<void>;

  /** Bulk insert. Empty input is a no-op. */
  insertCredits(rows: NewMediaCredit[]): Promise<void>;

  // ─── Videos (trailers, teasers, …) ───

  /** Read every video for a media. */
  findVideosByMediaId(mediaId: string): Promise<MediaVideo[]>;

  /** Hard delete every video row for a media. */
  deleteVideosByMediaId(mediaId: string): Promise<void>;

  /** Bulk insert. Empty input is a no-op. */
  insertVideos(rows: NewMediaVideo[]): Promise<void>;

  /**
   * Batch-lookup YouTube trailer keys for a set of media ids. Returns the
   * first-seen English `Trailer` per media (matches the legacy helper).
   */
  findTrailerKeysForMediaIds(mediaIds: string[]): Promise<Map<string, string>>;

  // ─── Watch providers ───

  /** Read every watch-provider row for a media (every region, every type). */
  findWatchProvidersByMediaId(mediaId: string): Promise<MediaWatchProvider[]>;

  /** Hard delete every watch-provider row for a media. */
  deleteWatchProvidersByMediaId(mediaId: string): Promise<void>;

  /** Bulk insert. Empty input is a no-op. */
  insertWatchProviders(rows: NewMediaWatchProvider[]): Promise<void>;

  /** Read the TMDB-global `watch_provider_link` table. Filters out rows
   *  whose `searchUrlTemplate` is null. */
  findWatchProviderLinks(): Promise<WatchProviderLink[]>;

  // ─── Recommendations (media_recommendation junction) ───

  /**
   * Resolve recommendations for a `(sourceMediaId, sourceType)` pair, with
   * per-language `title` / `overview` / `posterPath` / `logoPath` already
   * merged via the standard COALESCE chain. Used by the detail-screen recs
   * + similar lists.
   */
  findRecommendationsBySource(
    sourceMediaId: string,
    sourceType: RecommendationSourceType,
    language: LocaleCode,
  ): Promise<RecommendationSourceItem[]>;

  /**
   * Pull global recommended media with backdrops — the spotlight pool
   * fallback. Filters to media whose `metadata` aspect has succeeded and
   * which carry a non-null backdrop.
   */
  findRecommendedMediaWithBackdrops(
    language: LocaleCode,
    limit: number,
  ): Promise<LocalizedRecommendationItem[]>;

  /**
   * Pull a paginated slice of the global recommendation pool, with optional
   * exclusion + filter conditions. Trailer keys are joined post-query and
   * surfaced on each item.
   */
  findGlobalRecommendations(
    excludeItems: Array<{ externalId: number; provider: string }>,
    limit: number,
    offset: number,
    language: LocaleCode,
    filters?: RecsFilters,
  ): Promise<LocalizedRecommendationItem[]>;

  /**
   * Read existing `media_recommendation` rows for a source — used by
   * `refreshExtras` to compute the diff before deleting/inserting.
   */
  findRecommendationsForSource(sourceMediaId: string): Promise<
    Array<{
      id: string;
      mediaId: string;
      sourceType: RecommendationSourceType;
    }>
  >;

  /** Delete rows by primary id (junction-row level). */
  deleteRecommendationsByIds(ids: string[]): Promise<void>;

  /**
   * Delete every junction row whose `sourceMediaId` matches. Used by
   * `persistExtras` before the full re-insert path.
   */
  deleteRecommendationsBySource(sourceMediaId: string): Promise<void>;

  /**
   * Insert a junction row. Conflicts on
   * `(mediaId, sourceMediaId)` are silently skipped.
   */
  insertRecommendation(row: NewMediaRecommendation): Promise<void>;

  // ─── TMDB certifications (global catalog) ───

  /**
   * Bulk upsert the TMDB-global certification catalog. Conflicts on
   * `(type, region, rating)` update `meaning` / `sortOrder` /
   * `updatedAt`. Returns the count of rows in the input.
   */
  upsertTmdbCertifications(rows: NewTmdbCertification[]): Promise<number>;

  /** Count of certifications stored for a `(type)` discriminator — used by
   *  the lazy seed gate in the filter-sidebar router. */
  countTmdbCertifications(type: TmdbCertificationType): Promise<number>;
}
