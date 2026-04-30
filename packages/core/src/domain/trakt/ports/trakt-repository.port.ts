import type {
  NewTraktHistorySync,
  TraktHistorySync,
} from "@canto/core/domain/trakt/types/trakt-history-sync";
import type {
  NewTraktListLink,
  TraktListLink,
} from "@canto/core/domain/trakt/types/trakt-list-link";
import type { TraktSection } from "@canto/core/domain/trakt/types/trakt-section";
import type {
  TraktSyncState,
  TraktSyncStatePatch,
} from "@canto/core/domain/trakt/types/trakt-sync-state";

/**
 * `TraktRepositoryPort` covers the three trakt-only tables — `trakt_list_link`,
 * `trakt_sync_state`, `trakt_history_sync`. Cross-context tables (`media`,
 * `list`, `userWatchHistory`, `userMediaState`, `userRating`) stay accessible
 * through their own ports / direct repos in the use-cases until the matching
 * waves catch up.
 */
export interface TraktRepositoryPort {
  // ── Trakt List Link ──

  findListLinksByConnection(userConnectionId: string): Promise<TraktListLink[]>;
  findListLinkByLocalListId(localListId: string): Promise<TraktListLink | null>;
  upsertListLink(input: NewTraktListLink): Promise<TraktListLink>;
  deleteListLinkById(id: string): Promise<void>;
  deleteListLinksNotIn(
    userConnectionId: string,
    traktListIds: number[],
  ): Promise<number>;

  // ── Trakt Sync State ──

  findSyncStateByConnection(
    userConnectionId: string,
  ): Promise<TraktSyncState | null>;
  upsertSyncState(
    userConnectionId: string,
    patch: TraktSyncStatePatch,
  ): Promise<TraktSyncState>;
  setSectionWatermark(
    userConnectionId: string,
    section: TraktSection,
    remoteAt: Date,
  ): Promise<void>;

  // ── Trakt History Sync ──

  findHistorySyncByRemoteIds(
    userConnectionId: string,
    remoteHistoryIds: number[],
  ): Promise<TraktHistorySync[]>;
  findHistorySyncByLocalIds(
    userConnectionId: string,
    localHistoryIds: string[],
  ): Promise<TraktHistorySync[]>;
  createHistorySync(input: NewTraktHistorySync): Promise<TraktHistorySync | null>;
  attachRemoteIdToHistorySync(
    userConnectionId: string,
    localHistoryId: string,
    remoteHistoryId: number,
  ): Promise<void>;
}
