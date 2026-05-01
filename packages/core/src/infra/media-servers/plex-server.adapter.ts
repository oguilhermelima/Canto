import type {
  FindItemIdByProviderInput,
  MarkWatchStateInput,
  MediaServerPort,
  SetPlaybackPositionInput,
} from "@canto/core/domain/shared/ports/media-server.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import { fetchPlexMediaInfo } from "@canto/core/domain/media-servers/use-cases/fetch-info/plex";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";
import {
  findPlexItemIdByProviderId,
  markPlexItemUnwatched,
  markPlexItemWatched,
  setPlexPlaybackPosition,
} from "@canto/core/infra/media-servers/plex.adapter";

/**
 * Plex binding for `MediaServerPort`. Library listing maps Plex sections
 * (Directory entries) into the port's generic `MediaServerLibrary`; scan
 * dispatches to the section-refresh endpoint(s). Per-user playback state is
 * tracked server-wide on Plex, so `externalUserId` on write inputs is ignored.
 */
export function makePlexMediaServer(
  plex: PlexAdapterPort = makePlexAdapter(),
): MediaServerPort {
  return {
    testConnection: (url, token) => plex.testConnection(url, token),

    listLibraries: async (url, token) => {
      const sections = await plex.getSections(url, token);
      return sections.map((s) => ({
        id: s.key,
        name: s.title,
        type: s.type,
        paths: s.Location.map((l) => l.path),
      }));
    },

    scanLibrary: (url, token, sectionIds) =>
      plex.scanLibrary(url, token, sectionIds),

    fetchItemMediaInfo: (url, token, ratingKey, type) =>
      fetchPlexMediaInfo(plex, url, token, ratingKey, type),

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
}

/** Default Plex `MediaServerPort` instance — composition roots that don't
 *  need to swap the underlying adapter use this. */
export const plexMediaServer: MediaServerPort = makePlexMediaServer();
