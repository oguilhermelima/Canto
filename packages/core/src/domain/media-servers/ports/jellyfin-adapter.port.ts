/* -------------------------------------------------------------------------- */
/*  JellyfinAdapterPort                                                       */
/*                                                                            */
/*  Narrow surface of Jellyfin HTTP operations the domain layer depends on.  */
/*  Mirrors `infra/media-servers/jellyfin.adapter.ts` for the calls the use  */
/*  cases actually invoke. Higher-level orchestration (mark played, playback */
/*  push) lives behind {@link MediaServerPort}.                               */
/* -------------------------------------------------------------------------- */

import type {
  JellyfinStreamItem,
} from "@canto/core/domain/media-servers/types/streams";

export interface JellyfinLibraryFolder {
  Id: string;
  Name: string;
  CollectionType: string;
  Locations: string[];
}

export type PingPublicResult =
  | { ok: true; serverName: string; version: string }
  | { ok: false; reason: "unreachable" | "not-jellyfin"; status?: number };

export type AuthByNameResult =
  | { ok: true; accessToken: string; userId: string; userName: string }
  | { ok: false; status: number };

export interface JellyfinMovieMatch {
  id: string;
  name: string;
  path?: string;
}

export interface JellyfinAdapterPort {
  /** Public system-info ping — distinguishes "unreachable" from "not jellyfin". */
  pingPublic(url: string): Promise<PingPublicResult>;
  /** Authenticate by username/password. */
  authenticateByName(
    url: string,
    username: string,
    password: string,
  ): Promise<AuthByNameResult>;
  /** Create a persistent `Canto` API key (best-effort). */
  createApiKey(url: string, accessToken: string): Promise<boolean>;
  /** Look up the persisted `Canto` app key, if it exists. */
  findApiKey(url: string, accessToken: string): Promise<string | null>;
  /** Resolve the Jellyfin user id for a given API key. */
  getCurrentUserId(url: string, apiKey: string): Promise<string | null>;
  /** Test connection to a server with system info. */
  testConnection(url: string, apiKey: string): Promise<{ serverName: string; version: string }>;
  /** Trigger a per-library or full-library refresh. */
  triggerScan(url: string, apiKey: string, libraryId?: string): Promise<void>;
  /** List a server's virtual (library) folders. */
  getLibraryFolders(url: string, apiKey: string): Promise<JellyfinLibraryFolder[]>;
  /** Read a single item's current metadata. */
  getItem(
    url: string,
    apiKey: string,
    itemId: string,
  ): Promise<{
    name: string;
    year?: number;
    providerIds?: Record<string, string>;
  } | null>;
  /** Force a Jellyfin item to re-match against a TMDB id. */
  applyRemoteMatch(
    url: string,
    apiKey: string,
    itemId: string,
    type: "movie" | "show",
    tmdbId: number,
  ): Promise<void>;
  /** Find Jellyfin movies that match a Canto media's provider id. */
  findMoviesByProviderId(
    url: string,
    apiKey: string,
    media: { title: string; externalId: number; provider: string },
  ): Promise<JellyfinMovieMatch[]>;
  /** Merge multiple Jellyfin items into a single multi-version entry. */
  mergeVersions(url: string, apiKey: string, ids: string[]): Promise<void>;
  /** Fetch a single Jellyfin movie item with its media/stream fields populated. */
  fetchItemWithStreams(
    url: string,
    apiKey: string,
    itemId: string,
  ): Promise<JellyfinStreamItem | null>;
  /**
   * Fetch all episodes under a Jellyfin show id with media/stream fields. The
   * adapter paginates so callers receive the full list.
   */
  fetchShowEpisodesWithStreams(
    url: string,
    apiKey: string,
    showId: string,
  ): Promise<JellyfinStreamItem[]>;
}
