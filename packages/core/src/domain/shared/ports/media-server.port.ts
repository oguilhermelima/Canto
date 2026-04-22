import type { MediaFileInfo } from "../../use-cases/media-servers/fetch-info/shared";

export interface MediaServerLibrary {
  id: string;
  name: string;
  type: string;
  paths: string[];
}

/**
 * Abstracts common operations across Plex/Jellyfin. Adapter bindings live in
 * `infrastructure/adapters/media-servers/*-server.adapter.ts`. Callers pass
 * `url` + `apiKey` at call time because those come from admin settings and
 * may differ between an admin-level probe and a per-user connection.
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
}
