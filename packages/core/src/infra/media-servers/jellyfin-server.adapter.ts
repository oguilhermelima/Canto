import type {
  FindItemIdByProviderInput,
  MarkWatchStateInput,
  MediaServerPort,
  SetPlaybackPositionInput,
} from "@canto/core/domain/shared/ports/media-server.port";
import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import { fetchJellyfinMediaInfo } from "@canto/core/domain/media-servers/use-cases/fetch-info/jellyfin";
import { makeJellyfinAdapter } from "@canto/core/infra/media-servers/jellyfin.adapter-bindings";
import {
  findJellyfinItemIdByProviderForUser,
  markJellyfinItemPlayed,
  markJellyfinItemUnplayed,
  setJellyfinPlaybackPosition,
} from "@canto/core/infra/media-servers/jellyfin.adapter";

function requireJellyfinUserId(
  externalUserId: string | null | undefined,
  op: string,
): string {
  if (!externalUserId) {
    throw new Error(
      `Jellyfin ${op} requires externalUserId — connection not provisioned`,
    );
  }
  return externalUserId;
}

/**
 * Jellyfin binding for `MediaServerPort`. The library list flattens Jellyfin's
 * virtual-folder shape into the port's generic `MediaServerLibrary`; scan is
 * per-library when section ids are supplied, or a full library refresh
 * otherwise. Write methods require `externalUserId` because Jellyfin scopes
 * playback state per-user.
 */
export function makeJellyfinMediaServer(
  jellyfin: JellyfinAdapterPort = makeJellyfinAdapter(),
): MediaServerPort {
  return {
    testConnection: (url, apiKey) => jellyfin.testConnection(url, apiKey),

    listLibraries: async (url, apiKey) => {
      const folders = await jellyfin.getLibraryFolders(url, apiKey);
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
          sectionIds.map((id) => jellyfin.triggerScan(url, apiKey, id)),
        );
        return;
      }
      await jellyfin.triggerScan(url, apiKey);
    },

    fetchItemMediaInfo: (url, apiKey, itemId, type) =>
      fetchJellyfinMediaInfo(jellyfin, url, apiKey, itemId, type),

    setPlaybackPosition: (
      url,
      apiKey,
      input: SetPlaybackPositionInput,
    ): Promise<void> =>
      setJellyfinPlaybackPosition(
        url,
        apiKey,
        requireJellyfinUserId(input.externalUserId, "setPlaybackPosition"),
        input.itemId,
        input.positionSeconds,
        input.isCompleted,
      ),

    markPlayed: (url, apiKey, input: MarkWatchStateInput): Promise<void> =>
      markJellyfinItemPlayed(
        url,
        apiKey,
        requireJellyfinUserId(input.externalUserId, "markPlayed"),
        input.itemId,
      ),

    markUnplayed: (url, apiKey, input: MarkWatchStateInput): Promise<void> =>
      markJellyfinItemUnplayed(
        url,
        apiKey,
        requireJellyfinUserId(input.externalUserId, "markUnplayed"),
        input.itemId,
      ),

    findItemIdByProvider: (
      url,
      apiKey,
      input: FindItemIdByProviderInput,
    ): Promise<string | null> =>
      findJellyfinItemIdByProviderForUser(
        url,
        apiKey,
        requireJellyfinUserId(input.externalUserId, "findItemIdByProvider"),
        input.title,
        input.externalId,
        input.provider,
      ),
  };
}

/** Default Jellyfin `MediaServerPort` instance. */
export const jellyfinMediaServer: MediaServerPort = makeJellyfinMediaServer();
