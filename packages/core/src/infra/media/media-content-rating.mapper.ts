import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  MediaContentRating,
  MediaContentRatingId,
  NewMediaContentRating,
} from "@canto/core/domain/media/types/media-content-rating";
import type { mediaContentRating } from "@canto/db/schema";

type Row = typeof mediaContentRating.$inferSelect;
type Insert = typeof mediaContentRating.$inferInsert;

export function toDomain(row: Row): MediaContentRating {
  return {
    id: row.id as MediaContentRatingId,
    mediaId: row.mediaId as MediaId,
    region: row.region,
    rating: row.rating,
  };
}

export function toRow(input: NewMediaContentRating): Insert {
  return {
    mediaId: input.mediaId,
    region: input.region,
    rating: input.rating,
  };
}
