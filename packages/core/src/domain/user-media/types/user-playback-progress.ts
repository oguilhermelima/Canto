export type UserPlaybackProgressId = string
  & { readonly __brand: "UserPlaybackProgressId" };

/**
 * Per-(user, media, episode?) playback row. `episodeId` null = movie/show-
 * level; non-null = per-episode. Soft-deleted via `deletedAt`. Tombstones
 * prevent reverse-sync from resurrecting the row when a server still
 * reports the item as watched.
 */
export interface UserPlaybackProgress {
  id: UserPlaybackProgressId;
  userId: string;
  mediaId: string;
  episodeId: string | null;
  positionSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: Date | null;
  source: string | null;
  deletedAt: Date | null;
}

export interface UpsertUserPlaybackProgressInput {
  userId: string;
  mediaId: string;
  episodeId?: string | null;
  positionSeconds?: number;
  isCompleted?: boolean;
  lastWatchedAt?: Date | null;
  source?: string | null;
}

/** Snapshot of the row's pre-upsert state; lets callers implement echo-guard
 *  logic without a second DB round-trip. `null` = no live row to compare
 *  against (new insert / tombstoned-with-suppressed-write / tombstoned-revival). */
export interface PlaybackPreviousState {
  positionSeconds: number | null;
  isCompleted: boolean;
}

export interface UpsertPlaybackResult {
  row: UserPlaybackProgress | undefined;
  previous: PlaybackPreviousState | null;
}

export interface CompletedPlaybackEpisodeRow {
  mediaId: string;
  episodeId: string | null;
  isCompleted: boolean;
}
