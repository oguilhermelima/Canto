import type {
  TraktHistorySync,
  TraktHistorySyncId,
  TraktSyncedDirection,
} from "@canto/core/domain/trakt/types/trakt-history-sync";
import type { traktHistorySync } from "@canto/db/schema";

type TraktHistorySyncRow = typeof traktHistorySync.$inferSelect;

export function toDomain(row: TraktHistorySyncRow): TraktHistorySync {
  return {
    id: row.id as TraktHistorySyncId,
    userConnectionId: row.userConnectionId,
    localHistoryId: row.localHistoryId,
    remoteHistoryId: row.remoteHistoryId,
    syncedDirection: row.syncedDirection as TraktSyncedDirection,
    createdAt: row.createdAt,
  };
}
