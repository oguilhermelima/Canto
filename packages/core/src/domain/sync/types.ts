/* -------------------------------------------------------------------------- */
/*  Sync domain types                                                         */
/*                                                                            */
/*  Single source of truth for the shapes that flow through the sync          */
/*  pipeline (scanners → resolver → repository). Keep this file free of       */
/*  infrastructure imports so it can be reused in tests and in the UI.        */
/* -------------------------------------------------------------------------- */

export type ServerSource = "jellyfin" | "plex";

export type MediaKind = "movie" | "show";

export type SyncResult = "imported" | "skipped" | "unmatched" | "failed";

/**
 * External provider IDs extracted from a server item. Every field is
 * optional — not every library item carries every identifier.
 */
export interface ExternalIds {
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
}

/**
 * Playback / user-data metadata attached to a scanned item. For shows this
 * refers to the currently-playing episode, not the series as a whole.
 */
export interface ScannedPlayback {
  played: boolean;
  positionSeconds?: number;
  lastPlayedAt?: Date;
  seasonNumber?: number;
  episodeNumber?: number;
}

/**
 * The canonical output of every media server scanner. ONE shape to rule
 * them all — the rest of the pipeline must never inspect `source` to
 * decide how to parse fields.
 */
export interface ScannedMediaItem {
  source: ServerSource;
  /** Stable server-specific ID. Plex: ratingKey. Jellyfin: item Id. */
  serverItemId: string;
  /** FK to folder_server_link that produced this item. */
  serverLinkId: string;
  /** FK to download_folder — null when not yet linked. */
  libraryId: string | null;
  title: string;
  year?: number;
  type: MediaKind;
  externalIds: ExternalIds;
  path?: string;
  playback: ScannedPlayback;
}

/**
 * Reason classes surfaced from the sync pipeline. Used both for logging
 * and for the "Failed" tab in the UI.
 */
export type SyncFailureReason =
  | "unresolved-tmdb"
  | "scan-error"
  | "invalid-item"
  | "unknown";

export interface SyncSummary {
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  unmatched: number;
  failed: number;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  error?: string;
}

export { SyncAuthError, SyncFetchError } from "@canto/core/domain/sync/errors";

export function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function emptySummary(total: number): SyncSummary {
  return {
    total,
    processed: 0,
    imported: 0,
    skipped: 0,
    unmatched: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    status: "running",
  };
}
