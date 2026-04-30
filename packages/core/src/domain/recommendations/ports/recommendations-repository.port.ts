import type { BecauseWatchedRec } from "@canto/core/domain/recommendations/types/because-watched";
import type { RecsFilters } from "@canto/core/domain/recommendations/types/recs-filters";
import type {
  UserRecommendationReadRow,
  UserRecommendationRow,
} from "@canto/core/domain/recommendations/types/user-recommendation";

/** `(externalId, provider)` pair used to skip media the user already knows. */
export interface MediaExclusionRef {
  externalId: number;
  provider: string;
}

export interface RecommendationsRepositoryPort {
  /**
   * Shadow-swap rebuild: writes the full set as inactive, then atomically
   * activates new + deletes old + bumps the user's `recsVersion`.
   */
  rebuildUserRecommendations(
    userId: string,
    rows: UserRecommendationRow[],
  ): Promise<void>;

  /**
   * Additive upsert keyed on (userId, mediaId, version). Used for reactive
   * updates (list add) — leaves existing recs intact.
   */
  upsertUserRecommendations(
    userId: string,
    rows: UserRecommendationRow[],
  ): Promise<void>;

  /** Page through a user's active recommendations with filters + ordering. */
  findUserRecommendations(
    userId: string,
    excludeItems: MediaExclusionRef[],
    limit: number,
    offset: number,
    filters?: RecsFilters,
    language?: string,
  ): Promise<UserRecommendationReadRow[]>;

  /** Top-weighted active items with backdrops, for the home-page hero. */
  findUserSpotlightItems(
    userId: string,
    excludeItems: MediaExclusionRef[],
    limit: number,
    language?: string,
  ): Promise<UserRecommendationReadRow[]>;

  /** Active rec count, regardless of media enrichment state. */
  countUserRecommendations(userId: string): Promise<number>;

  /** Drop active recs derived from a specific source seed (list removal). */
  deleteUserRecommendationsForSource(
    userId: string,
    sourceMediaId: string,
  ): Promise<void>;

  /** Hide a specific media from a user's active recs (list add). */
  removeMediaFromUserRecs(userId: string, mediaId: string): Promise<void>;

  /** User ids whose recs are stale (null or > 24h). Daily safety-net job. */
  findUsersForDailyRecsCheck(): Promise<string[]>;

  /**
   * Top-N quality-filtered rec candidates for a single seed media, ordered by
   * Bayesian weighted score. Returns the denormalized columns needed to
   * persist a `user_recommendation` row without an extra join.
   */
  findRecCandidatesForSeed(
    sourceMediaId: string,
    limit: number,
  ): Promise<
    Array<{
      mediaId: string;
      externalId: number;
      provider: string;
      type: string;
      title: string | null;
      overview: string | null;
      posterPath: string | null;
      backdropPath: string | null;
      logoPath: string | null;
      voteAverage: number | null;
      year: number | null;
      releaseDate: string | null;
      genres: string[] | null;
      genreIds: number[] | null;
      runtime: number | null;
      originalLanguage: string | null;
      contentRating: string | null;
      status: string | null;
      popularity: number | null;
    }>
  >;

  /**
   * Distinct source media ids from the server library (in_library=true) that
   * have at least one recommendation. Used as fallback seeds when the user
   * has few personal items.
   */
  findServerRecSources(limit: number): Promise<Array<{ sourceMediaId: string }>>;

  /**
   * User list items with genres and list type, newest first, excluding server
   * library items. Used by the rec-rebuild to select diverse seeds.
   */
  findUserListItemsForRecs(
    userId: string,
  ): Promise<
    Array<{ mediaId: string; genres: string[] | null; listType: string }>
  >;

  /**
   * Top-N "because you watched X" recs per source media, ranked by weighted
   * score and overlaid with the user's localization.
   */
  findBecauseWatchedRecs(
    userId: string,
    sourceMediaIds: string[],
    mediaType: "movie" | "show" | undefined,
    perSourceLimit: number,
    language: string,
  ): Promise<BecauseWatchedRec[]>;
}
