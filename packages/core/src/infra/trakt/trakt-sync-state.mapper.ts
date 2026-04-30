import type {
  TraktSyncState,
  TraktSyncStateId,
} from "@canto/core/domain/trakt/types/trakt-sync-state";
import type { traktSyncState } from "@canto/db/schema";

type TraktSyncStateRow = typeof traktSyncState.$inferSelect;

export function toDomain(row: TraktSyncStateRow): TraktSyncState {
  return {
    id: row.id as TraktSyncStateId,
    userConnectionId: row.userConnectionId,
    lastPulledAt: row.lastPulledAt,
    lastPushedAt: row.lastPushedAt,
    lastActivityAt: row.lastActivityAt,
    watchedMoviesAt: row.watchedMoviesAt,
    watchedShowsAt: row.watchedShowsAt,
    historyAt: row.historyAt,
    watchlistAt: row.watchlistAt,
    ratingsAt: row.ratingsAt,
    favoritesAt: row.favoritesAt,
    listsAt: row.listsAt,
    playbackAt: row.playbackAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
