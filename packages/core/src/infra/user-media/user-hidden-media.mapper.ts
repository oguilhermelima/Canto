import type { UserHiddenMedia } from "@canto/core/domain/user-media/types/user-hidden-media";
import type { userHiddenMedia } from "@canto/db/schema";

type Row = typeof userHiddenMedia.$inferSelect;

export function toDomain(row: Row): UserHiddenMedia {
  return {
    userId: row.userId,
    externalId: row.externalId,
    provider: row.provider,
    type: row.type,
    title: row.title,
    posterPath: row.posterPath,
    createdAt: row.createdAt,
  };
}
