import type {
  NewTraktListLink,
  TraktListLink,
  TraktListLinkId,
} from "@canto/core/domain/trakt/types/trakt-list-link";
import type { traktListLink } from "@canto/db/schema";

type TraktListLinkRow = typeof traktListLink.$inferSelect;
type TraktListLinkInsert = typeof traktListLink.$inferInsert;

export function toDomain(row: TraktListLinkRow): TraktListLink {
  return {
    id: row.id as TraktListLinkId,
    userConnectionId: row.userConnectionId,
    traktListId: row.traktListId,
    traktListSlug: row.traktListSlug,
    localListId: row.localListId,
    remoteUpdatedAt: row.remoteUpdatedAt,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewTraktListLink): TraktListLinkInsert {
  return {
    userConnectionId: input.userConnectionId,
    traktListId: input.traktListId,
    traktListSlug: input.traktListSlug,
    localListId: input.localListId,
    remoteUpdatedAt: input.remoteUpdatedAt ?? null,
    lastSyncedAt: input.lastSyncedAt ?? new Date(),
  };
}
