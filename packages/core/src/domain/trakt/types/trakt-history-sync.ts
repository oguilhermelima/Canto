export type TraktHistorySyncId = string
  & { readonly __brand: "TraktHistorySyncId" };

export type TraktSyncedDirection = "pull" | "push";

/**
 * Pairing row between a local `user_watch_history` row and a remote Trakt
 * history event. `localHistoryId` and `remoteHistoryId` may be either-or:
 * - `pull` rows always have `remoteHistoryId`; `localHistoryId` is set when
 *   the inserted local row exists.
 * - `push` rows always have `localHistoryId`; `remoteHistoryId` is filled
 *   later by `linkPulledHistoryBackfill` once Trakt surfaces the event.
 */
export interface TraktHistorySync {
  id: TraktHistorySyncId;
  userConnectionId: string;
  localHistoryId: string | null;
  remoteHistoryId: number | null;
  syncedDirection: TraktSyncedDirection;
  createdAt: Date;
}

export interface NewTraktHistorySync {
  userConnectionId: string;
  localHistoryId?: string | null;
  remoteHistoryId?: number | null;
  syncedDirection: TraktSyncedDirection;
}
