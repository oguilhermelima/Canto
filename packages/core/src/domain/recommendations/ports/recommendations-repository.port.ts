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
