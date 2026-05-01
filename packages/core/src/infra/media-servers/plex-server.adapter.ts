import type {
  FindItemIdByProviderInput,
  MarkWatchStateInput,
  MediaServerPort,
  SetPlaybackPositionInput,
} from "@canto/core/domain/shared/ports/media-server.port";
import { fetchPlexMediaInfo } from "@canto/core/domain/media-servers/use-cases/fetch-info/plex";
import {
  findPlexItemIdByProviderId,
  getPlexSections,
  markPlexItemUnwatched,
  markPlexItemWatched,
  scanPlexLibrary,
  setPlexPlaybackPosition,
  testPlexConnection,
} from "@canto/core/infra/media-servers/plex.adapter";

/**
 * Plex binding for `MediaServerPort`. Library listing maps Plex sections
 * (Directory entries) into the port's generic `MediaServerLibrary`; scan
 * dispatches to the section-refresh endpoint(s). Per-user playback state is
 * tracked server-wide on Plex, so the `externalUserId` field is ignored.
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

  setPlaybackPosition: (
    url,
    token,
    input: SetPlaybackPositionInput,
  ): Promise<void> =>
    setPlexPlaybackPosition(
      url,
      token,
      input.itemId,
      input.positionSeconds,
      input.isCompleted,
    ),

  markPlayed: (url, token, input: MarkWatchStateInput): Promise<void> =>
    markPlexItemWatched(url, token, input.itemId),

  markUnplayed: (url, token, input: MarkWatchStateInput): Promise<void> =>
    markPlexItemUnwatched(url, token, input.itemId),

  findItemIdByProvider: (
    url,
    token,
    input: FindItemIdByProviderInput,
  ): Promise<string | null> =>
    findPlexItemIdByProviderId(
      url,
      token,
      input.title,
      input.externalId,
      input.provider,
      input.type,
    ),
};
