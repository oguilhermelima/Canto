import type {
  UserRating,
  UserRatingId,
} from "@canto/core/domain/user-media/types/user-rating";
import type { userRating } from "@canto/db/schema";

type Row = typeof userRating.$inferSelect;

export function toDomain(row: Row): UserRating {
  return {
    id: row.id as UserRatingId,
    userId: row.userId,
    mediaId: row.mediaId,
    seasonId: row.seasonId,
    episodeId: row.episodeId,
    rating: row.rating,
    comment: row.comment,
    isOverride: row.isOverride,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
