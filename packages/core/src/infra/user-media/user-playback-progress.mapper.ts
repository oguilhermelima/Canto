import type {
  UpsertUserPlaybackProgressInput,
  UserPlaybackProgress,
  UserPlaybackProgressId,
} from "@canto/core/domain/user-media/types/user-playback-progress";
import type { userPlaybackProgress } from "@canto/db/schema";

type Row = typeof userPlaybackProgress.$inferSelect;
type Insert = typeof userPlaybackProgress.$inferInsert;

export function toDomain(row: Row): UserPlaybackProgress {
  return {
    id: row.id as UserPlaybackProgressId,
    userId: row.userId,
    mediaId: row.mediaId,
    episodeId: row.episodeId,
    positionSeconds: row.positionSeconds,
    isCompleted: row.isCompleted,
    lastWatchedAt: row.lastWatchedAt,
    source: row.source,
    deletedAt: row.deletedAt,
  };
}

export function toRow(input: UpsertUserPlaybackProgressInput): Insert {
  return {
    userId: input.userId,
    mediaId: input.mediaId,
    episodeId: input.episodeId ?? null,
    ...(input.positionSeconds !== undefined && {
      positionSeconds: input.positionSeconds,
    }),
    ...(input.isCompleted !== undefined && { isCompleted: input.isCompleted }),
    ...(input.lastWatchedAt !== undefined && {
      lastWatchedAt: input.lastWatchedAt,
    }),
    ...(input.source !== undefined && { source: input.source }),
  };
}
