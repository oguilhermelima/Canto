import type { MediaFileInfo } from "../../media-servers/use-cases/fetch-info/shared";

export interface MediaServerLibrary {
  id: string;
  name: string;
  type: string;
  paths: string[];
}

export interface SetPlaybackPositionInput {
  itemId: string;
  /** Required for Jellyfin (per-user playback state). Plex ignores this. */
  externalUserId?: string | null;
  positionSeconds: number;
  isCompleted: boolean;
}

export interface MarkWatchStateInput {
  itemId: string;
  /** Required for Jellyfin. Plex ignores this. */
  externalUserId?: string | null;
}

export interface FindItemIdByProviderInput {
  title: string;
  externalId: number;
  provider: "tmdb" | "tvdb";
  type: "movie" | "show";
  /** Required for Jellyfin (per-user library search). Plex ignores this. */
  externalUserId?: string | null;
}

/**
 * Abstracts common operations across Plex/Jellyfin. Adapter bindings live in
 * `infrastructure/adapters/media-servers/*-server.adapter.ts`. Callers pass
 * `url` + `apiKey` at call time because those come from admin settings and
 * may differ between an admin-level probe and a per-user connection.
 *
 * Write methods accept an optional `externalUserId` because Jellyfin scopes
 * playback state per-user while Plex tracks it server-wide; the Jellyfin
 * binding asserts the field is present, the Plex binding ignores it.
 */
export interface MediaServerPort {
  testConnection(
    url: string,
    apiKey: string,
  ): Promise<{ serverName: string; version: string }>;

  listLibraries(
    url: string,
    apiKey: string,
  ): Promise<MediaServerLibrary[]>;

  scanLibrary(
    url: string,
    apiKey: string,
    sectionIds?: string[],
  ): Promise<void>;

  /**
   * Fetch normalized stream-level media info for one item. Shows return one
   * entry per episode; movies return exactly one entry.
   */
  fetchItemMediaInfo(
    url: string,
    apiKey: string,
    itemId: string,
    type: "movie" | "show",
  ): Promise<MediaFileInfo[]>;

  /**
   * Update an item's playback position. When `isCompleted` is true the binding
   * marks the item as fully watched regardless of position.
   */
  setPlaybackPosition(
    url: string,
    apiKey: string,
    input: SetPlaybackPositionInput,
  ): Promise<void>;

  /** Flip an item to fully watched. */
  markPlayed(
    url: string,
    apiKey: string,
    input: MarkWatchStateInput,
  ): Promise<void>;

  /** Flip an item back to unwatched. */
  markUnplayed(
    url: string,
    apiKey: string,
    input: MarkWatchStateInput,
  ): Promise<void>;

  /**
   * Best-effort lookup of a server item id from a Canto media's provider id
   * (tmdb/tvdb). Returns null when no matching item exists on the server —
   * callers fall back to whatever they have or skip the push.
   */
  findItemIdByProvider(
    url: string,
    apiKey: string,
    input: FindItemIdByProviderInput,
  ): Promise<string | null>;
}
