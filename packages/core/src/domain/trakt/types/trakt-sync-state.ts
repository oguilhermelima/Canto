export type TraktSyncStateId = string & { readonly __brand: "TraktSyncStateId" };

/**
 * Per-connection state snapshot. Carries one watermark per `TraktSection` —
 * each one is the remote `last_activities` timestamp at the moment that
 * section was last pulled successfully. NULL means "never synced".
 *
 * `lastActivityAt` is the legacy "have we ever synced this connection" flag;
 * a NULL value flips `initialSync=true` and biases reconcilers toward
 * importing remote data. See `decidePresenceAction` / `reconcileListItem`.
 */
export interface TraktSyncState {
  id: TraktSyncStateId;
  userConnectionId: string;
  lastPulledAt: Date | null;
  lastPushedAt: Date | null;
  lastActivityAt: Date | null;
  watchedMoviesAt: Date | null;
  watchedShowsAt: Date | null;
  historyAt: Date | null;
  watchlistAt: Date | null;
  ratingsAt: Date | null;
  favoritesAt: Date | null;
  listsAt: Date | null;
  playbackAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Patch shape for `upsertTraktSyncState`. Any field omitted keeps its prior
 *  value on update; on insert, missing fields fall back to `null`. */
export interface TraktSyncStatePatch {
  lastPulledAt?: Date | null;
  lastPushedAt?: Date | null;
  lastActivityAt?: Date | null;
  watchedMoviesAt?: Date | null;
  watchedShowsAt?: Date | null;
  historyAt?: Date | null;
  watchlistAt?: Date | null;
  ratingsAt?: Date | null;
  favoritesAt?: Date | null;
  listsAt?: Date | null;
  playbackAt?: Date | null;
}
