import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import {
  applyJellyfinRemoteMatch,
  authenticateJellyfinByName,
  createJellyfinApiKey,
  fetchJellyfinItemWithStreams,
  fetchJellyfinShowEpisodesWithStreams,
  findJellyfinApiKey,
  findJellyfinMoviesByProviderId,
  getJellyfinCurrentUserId,
  getJellyfinItem,
  getJellyfinLibraryFolders,
  mergeJellyfinVersions,
  pingJellyfinPublic,
  testJellyfinConnection,
  triggerJellyfinScan,
} from "@canto/core/infra/media-servers/jellyfin.adapter";

/** Wraps the pure Jellyfin HTTP functions as a `JellyfinAdapterPort`. */
export function makeJellyfinAdapter(): JellyfinAdapterPort {
  return {
    pingPublic: (url) => pingJellyfinPublic(url),
    authenticateByName: (url, username, password) =>
      authenticateJellyfinByName(url, username, password),
    createApiKey: (url, accessToken) => createJellyfinApiKey(url, accessToken),
    findApiKey: (url, accessToken) => findJellyfinApiKey(url, accessToken),
    getCurrentUserId: (url, apiKey) => getJellyfinCurrentUserId(url, apiKey),
    testConnection: (url, apiKey) => testJellyfinConnection(url, apiKey),
    triggerScan: (url, apiKey, libraryId) => triggerJellyfinScan(url, apiKey, libraryId),
    getLibraryFolders: (url, apiKey) => getJellyfinLibraryFolders(url, apiKey),
    getItem: (url, apiKey, itemId) => getJellyfinItem(url, apiKey, itemId),
    applyRemoteMatch: (url, apiKey, itemId, type, tmdbId) =>
      applyJellyfinRemoteMatch(url, apiKey, itemId, type, tmdbId),
    findMoviesByProviderId: (url, apiKey, media) =>
      findJellyfinMoviesByProviderId(url, apiKey, media),
    mergeVersions: (url, apiKey, ids) => mergeJellyfinVersions(url, apiKey, ids),
    fetchItemWithStreams: (url, apiKey, itemId) =>
      fetchJellyfinItemWithStreams(url, apiKey, itemId),
    fetchShowEpisodesWithStreams: (url, apiKey, showId) =>
      fetchJellyfinShowEpisodesWithStreams(url, apiKey, showId),
  };
}
