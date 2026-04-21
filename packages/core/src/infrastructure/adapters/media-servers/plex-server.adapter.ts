import type { MediaServerPort } from "../../../domain/ports/media-server.port";
import { fetchPlexMediaInfo } from "../../../domain/use-cases/media-servers/fetch-info/plex";
import {
  getPlexSections,
  scanPlexLibrary,
  testPlexConnection,
} from "./plex";

/**
 * Plex binding for `MediaServerPort`. Library listing maps Plex sections
 * (Directory entries) into the port's generic `MediaServerLibrary`; scan
 * dispatches to the section-refresh endpoint(s).
 */
export const plexMediaServer: MediaServerPort = {
  testConnection: (url, token) => testPlexConnection(url, token),

  listLibraries: async (url, token) => {
    const sections = await getPlexSections(url, token);
    return sections.map((s) => ({
      id: s.key,
      name: s.title,
      type: s.type,
      paths: s.Location.map((l) => l.path),
    }));
  },

  scanLibrary: (url, token, sectionIds) =>
    scanPlexLibrary(url, token, sectionIds),

  fetchItemMediaInfo: (url, token, ratingKey, type) =>
    fetchPlexMediaInfo(url, token, ratingKey, type),
};
