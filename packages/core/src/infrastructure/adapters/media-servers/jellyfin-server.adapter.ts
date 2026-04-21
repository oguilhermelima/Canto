import type { MediaServerPort } from "../../../domain/ports/media-server.port";
import { fetchJellyfinMediaInfo } from "../../../domain/use-cases/media-servers/fetch-info/jellyfin";
import {
  getJellyfinLibraryFolders,
  testJellyfinConnection,
  triggerJellyfinScan,
} from "./jellyfin";

/**
 * Jellyfin binding for `MediaServerPort`. The library list flattens Jellyfin's
 * virtual-folder shape into the port's generic `MediaServerLibrary`; scan is
 * per-library when section ids are supplied, or a full library refresh
 * otherwise.
 */
export const jellyfinMediaServer: MediaServerPort = {
  testConnection: (url, apiKey) => testJellyfinConnection(url, apiKey),

  listLibraries: async (url, apiKey) => {
    const folders = await getJellyfinLibraryFolders(url, apiKey);
    return folders.map((f) => ({
      id: f.Id,
      name: f.Name,
      type: f.CollectionType,
      paths: f.Locations,
    }));
  },

  scanLibrary: async (url, apiKey, sectionIds) => {
    if (sectionIds && sectionIds.length > 0) {
      await Promise.all(
        sectionIds.map((id) => triggerJellyfinScan(url, apiKey, id)),
      );
      return;
    }
    await triggerJellyfinScan(url, apiKey);
  },

  fetchItemMediaInfo: (url, apiKey, itemId, type) =>
    fetchJellyfinMediaInfo(url, apiKey, itemId, type),
};
