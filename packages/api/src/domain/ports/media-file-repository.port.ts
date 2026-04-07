import type { mediaFile } from "@canto/db/schema";

type MediaFileRow = typeof mediaFile.$inferSelect;
type MediaFileInsert = typeof mediaFile.$inferInsert;

export interface MediaFileRepositoryPort {
  findMediaFilesByTorrentId(torrentId: string, status?: string): Promise<MediaFileRow[]>;

  findMediaFilesByMediaId(
    mediaId: string,
  ): Promise<
    Array<
      MediaFileRow & {
        episode: { id: string; number: number; title: string | null; seasonId: string; season: { id: string; number: number } } | null;
        torrent: { id: string; quality: string | null; source: string | null; title: string } | null;
      }
    >
  >;

  findDuplicateMovieFile(
    mediaId: string,
    quality: string,
    source: string,
  ): Promise<MediaFileRow | undefined>;

  findDuplicateEpisodeFile(
    episodeId: string,
    quality: string,
    source: string,
  ): Promise<MediaFileRow | undefined>;

  createMediaFile(data: MediaFileInsert): Promise<MediaFileRow | undefined>;
  updateMediaFile(id: string, data: Partial<MediaFileInsert>): Promise<MediaFileRow | undefined>;
  deleteMediaFile(id: string): Promise<void>;
  deleteMediaFilesByTorrentId(torrentId: string): Promise<void>;
  createMediaFileNoConflict(data: MediaFileInsert): Promise<void>;
  findAllMediaFiles(status?: string): Promise<MediaFileRow[]>;
}
