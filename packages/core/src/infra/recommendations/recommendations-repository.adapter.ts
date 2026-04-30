import type { Database } from "@canto/db/client";
import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import { findBecauseWatchedRecs } from "@canto/core/infra/recommendations/because-watched-repository";
import {
  countUserRecommendations,
  deleteUserRecommendationsForSource,
  findUserRecommendations,
  findUserSpotlightItems,
  findUsersForDailyRecsCheck,
  rebuildUserRecommendations,
  removeMediaFromUserRecs,
  upsertUserRecommendations,
} from "@canto/core/infra/recommendations/user-recommendation-repository";

export function makeRecommendationsRepository(
  db: Database,
): RecommendationsRepositoryPort {
  return {
    rebuildUserRecommendations: async (userId, rows) => {
      await rebuildUserRecommendations(db, userId, rows);
    },
    upsertUserRecommendations: async (userId, rows) => {
      await upsertUserRecommendations(db, userId, rows);
    },
    findUserRecommendations: async (userId, excludeItems, limit, offset, filters, language) => {
      return findUserRecommendations(
        db,
        userId,
        excludeItems,
        limit,
        offset,
        filters,
        language,
      );
    },
    findUserSpotlightItems: async (userId, excludeItems, limit, language) => {
      return findUserSpotlightItems(db, userId, excludeItems, limit, language);
    },
    countUserRecommendations: async (userId) => {
      return countUserRecommendations(db, userId);
    },
    deleteUserRecommendationsForSource: async (userId, sourceMediaId) => {
      await deleteUserRecommendationsForSource(db, userId, sourceMediaId);
    },
    removeMediaFromUserRecs: async (userId, mediaId) => {
      await removeMediaFromUserRecs(db, userId, mediaId);
    },
    findUsersForDailyRecsCheck: async () => {
      const rows = await findUsersForDailyRecsCheck(db);
      return rows.map((r) => r.id);
    },
    findBecauseWatchedRecs: async (
      userId,
      sourceMediaIds,
      mediaType,
      perSourceLimit,
      language,
    ) => {
      return findBecauseWatchedRecs(
        db,
        userId,
        sourceMediaIds,
        mediaType,
        perSourceLimit,
        language,
      );
    },
  };
}
