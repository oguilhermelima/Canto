import type {
  UpsertUserMediaStateInput,
  UserMediaState,
  UserMediaStatus,
} from "@canto/core/domain/user-media/types/user-media-state";
import type { userMediaState } from "@canto/db/schema";

type Row = typeof userMediaState.$inferSelect;
type Insert = typeof userMediaState.$inferInsert;

function isStatus(value: string | null): value is UserMediaStatus {
  return (
    value === "none" ||
    value === "planned" ||
    value === "watching" ||
    value === "completed" ||
    value === "dropped"
  );
}

export function toDomain(row: Row): UserMediaState {
  return {
    userId: row.userId,
    mediaId: row.mediaId,
    status: row.status && isStatus(row.status) ? row.status : null,
    rating: row.rating,
    isFavorite: row.isFavorite,
    isHidden: row.isHidden,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: UpsertUserMediaStateInput): Insert {
  return {
    userId: input.userId,
    mediaId: input.mediaId,
    ...(input.status !== undefined && { status: input.status }),
    ...(input.rating !== undefined && { rating: input.rating }),
    ...(input.isFavorite !== undefined && { isFavorite: input.isFavorite }),
    ...(input.isHidden !== undefined && { isHidden: input.isHidden }),
    ...(input.updatedAt !== undefined && { updatedAt: input.updatedAt }),
  };
}
