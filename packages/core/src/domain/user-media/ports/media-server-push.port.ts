import type { ServerSource } from "@canto/core/domain/sync/types";

/**
 * High-level fan-out port for "push state from Canto → media servers". The
 * underlying implementation walks each enabled user connection and dispatches
 * via `MediaServerPort`; this port lets the user-media use cases stay
 * agnostic of the connection / version-resolution machinery.
 */
export interface MediaServerPushPort {
  pushWatchState(userId: string, mediaId: string, watched: boolean): Promise<void>;
  pushPlaybackPosition(
    userId: string,
    mediaId: string,
    episodeId: string | null | undefined,
    positionSeconds: number,
    isCompleted: boolean,
    excludeSource: ServerSource | null,
  ): Promise<void>;
}
