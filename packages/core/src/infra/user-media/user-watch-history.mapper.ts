import type {
  NewUserWatchHistory,
  UserWatchHistory,
  UserWatchHistoryId,
} from "@canto/core/domain/user-media/types/user-watch-history";
import type { userWatchHistory } from "@canto/db/schema";

type Row = typeof userWatchHistory.$inferSelect;
type Insert = typeof userWatchHistory.$inferInsert;

export function toDomain(row: Row): UserWatchHistory {
  return {
    id: row.id as UserWatchHistoryId,
    userId: row.userId,
    mediaId: row.mediaId,
    episodeId: row.episodeId,
    watchedAt: row.watchedAt,
    source: row.source,
    deletedAt: row.deletedAt,
  };
}

export function toRow(input: NewUserWatchHistory): Insert {
  return {
    userId: input.userId,
    mediaId: input.mediaId,
    episodeId: input.episodeId ?? null,
    ...(input.watchedAt !== undefined && { watchedAt: input.watchedAt }),
    source: input.source ?? null,
  };
}
