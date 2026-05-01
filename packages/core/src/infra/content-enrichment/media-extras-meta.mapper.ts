import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  MediaRecommendation,
  MediaRecommendationId,
  NewMediaRecommendation,
} from "@canto/core/domain/media/types/media-recommendation";
import type { mediaRecommendation } from "@canto/db/schema";

type RecommendationRow = typeof mediaRecommendation.$inferSelect;
type RecommendationInsert = typeof mediaRecommendation.$inferInsert;

export function recommendationToDomain(row: RecommendationRow): MediaRecommendation {
  return {
    id: row.id as MediaRecommendationId,
    mediaId: row.mediaId as MediaId,
    sourceMediaId: row.sourceMediaId as MediaId,
    sourceType: row.sourceType,
    createdAt: row.createdAt,
  };
}

export function recommendationToRow(
  input: NewMediaRecommendation,
): RecommendationInsert {
  return {
    mediaId: input.mediaId,
    sourceMediaId: input.sourceMediaId,
    sourceType: input.sourceType,
  };
}
