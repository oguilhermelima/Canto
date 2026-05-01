import type { ServerSource } from "@canto/core/domain/sync/types";
import type {
  MediaVersionEpisodeInsert,
  MediaVersionEpisodeRow,
  MediaVersionGroupCounts,
  MediaVersionInsert,
  MediaVersionRow,
  MediaVersionWithMedia,
} from "@canto/core/domain/media-servers/types/media-version";

/**
 * `MediaVersionRepositoryPort` covers `media_version` + `media_version_episode`
 * — the per-server observation rows that bind a Canto media to one or more
 * Plex/Jellyfin items. Reads cross into `media` for the admin grouping UI;
 * writes are scoped to the version tables.
 */
export interface MediaVersionRepositoryPort {
  // ── Reads ──

  findById(id: string): Promise<MediaVersionRow | undefined>;
  findByMediaId(mediaId: string): Promise<MediaVersionRow[]>;
  findBySourceAndServerItemId(
    source: ServerSource,
    serverItemId: string,
  ): Promise<MediaVersionRow | undefined>;
  findWithEpisodesByMediaId(
    mediaId: string,
  ): Promise<Array<MediaVersionRow & { episodes: MediaVersionEpisodeRow[] }>>;
  findWithMedia(
    language: string,
    filters: { server?: ServerSource; search?: string },
  ): Promise<MediaVersionWithMedia[]>;
  countGroups(): Promise<MediaVersionGroupCounts>;

  // ── Writes ──

  upsert(input: MediaVersionInsert): Promise<MediaVersionRow | undefined>;
  update(id: string, input: Partial<MediaVersionInsert>): Promise<void>;
  deleteById(id: string): Promise<void>;

  // ── Episode helpers ──

  createEpisodes(input: MediaVersionEpisodeInsert[]): Promise<void>;
  deleteEpisodesByVersionId(versionId: string): Promise<void>;

  // ── Maintenance ──

  pruneStale(
    source: ServerSource,
    serverLinkIds: string[],
    cutoffDate: Date,
  ): Promise<void>;
  touchSeen(
    source: ServerSource,
    serverItemIds: string[],
    now: Date,
  ): Promise<void>;
}
