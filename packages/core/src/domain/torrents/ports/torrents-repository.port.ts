import type {
  BlocklistEntry,
  NewBlocklistEntry,
} from "@canto/core/domain/torrents/types/blocklist";
import type {
  Download,
  NewDownload,
  UpdateDownloadInput,
} from "@canto/core/domain/torrents/types/download";
import type {
  MediaFile,
  MediaFileWithDetails,
  NewMediaFile,
  UpdateMediaFileInput,
} from "@canto/core/domain/torrents/types/media-file";
import type { DownloadProfile } from "@canto/core/domain/torrents/rules/download-profile";
import type {
  ReleaseFlavor,
  ReleaseGroupLookups,
} from "@canto/core/domain/torrents/rules/release-groups";
import type {
  AdminDownloadPolicy,
  ScoringRules,
} from "@canto/core/domain/shared/rules/scoring-rules";

export interface DownloadConfig {
  rules: ScoringRules;
  policy: AdminDownloadPolicy;
}

export interface ActiveProfileQuery {
  mediaDownloadProfileId: string | null;
  folderDownloadProfileId: string | null;
  flavor: ReleaseFlavor;
}

/**
 * Single port covering the four torrent-context tables — `download`,
 * `media_file`, `blocklist`, plus a slim `media_version` projection that
 * a few torrent flows need (auto-supersede / repack scoring).
 *
 * Aggregating reads (live torrent merge with media metadata, paginated
 * cross-context listings) intentionally stay outside this port — they
 * cross context boundaries (media, episode) and need a separate design
 * pass when the media wave runs.
 */
export interface TorrentsRepositoryPort {
  // ── Download ──

  findDownloadById(id: string): Promise<Download | null>;
  findDownloadByHash(hash: string): Promise<Download | null>;
  findDownloadsByHashes(hashes: string[]): Promise<Download[]>;
  findDownloadByTitle(title: string): Promise<Download | null>;
  findDownloadsByMediaId(mediaId: string): Promise<Download[]>;
  findAllDownloads(): Promise<Download[]>;
  findAllDownloadsPaginated(limit: number, offset: number): Promise<Download[]>;
  countAllDownloads(): Promise<number>;
  /** Recently-imported downloads since `since`, capped at `limit`. */
  findRecentImportedDownloads(since: Date, limit: number): Promise<Download[]>;
  /** Downloads waiting to be imported (with backoff filter). */
  findUnimportedDownloads(): Promise<Download[]>;

  createDownload(input: NewDownload): Promise<Download>;
  updateDownload(id: string, input: UpdateDownloadInput): Promise<Download | null>;
  updateDownloadBatch(ids: string[], input: UpdateDownloadInput): Promise<void>;
  deleteDownload(id: string): Promise<void>;

  /** Atomic claim — flips `importing` from false to true. Returns the row
   *  on success, null when another worker beat us to it. */
  claimDownloadForImport(id: string): Promise<Download | null>;
  /** Reset `importing=true` rows older than 30 minutes back to false. */
  resetStaleImports(): Promise<void>;

  // ── Media File ──

  findMediaFilesByDownloadId(
    downloadId: string,
    status?: string,
  ): Promise<MediaFile[]>;
  /** All media-file rows for a media id, with episode + season + download
   *  details joined inline. Drives the file-organization rename flow. */
  findMediaFilesByMediaId(mediaId: string): Promise<MediaFileWithDetails[]>;
  /** Movie dedup gate — matches imported rows only. */
  findDuplicateMovieFile(
    mediaId: string,
    quality: string,
    source: string,
  ): Promise<MediaFile | null>;
  /** Episode dedup gate — matches imported rows only. */
  findDuplicateEpisodeFile(
    episodeId: string,
    quality: string,
    source: string,
  ): Promise<MediaFile | null>;
  /** True when at least one imported `media_file` row points at this
   *  episode. Used by the gap detector to skip episodes whose download
   *  is already on disk. */
  hasImportedFileForEpisode(episodeId: string): Promise<boolean>;
  createMediaFile(input: NewMediaFile): Promise<MediaFile>;
  /** Insert without conflict (used by retry paths that may re-insert the same row). */
  createMediaFileNoConflict(input: NewMediaFile): Promise<void>;
  updateMediaFile(id: string, input: UpdateMediaFileInput): Promise<MediaFile | null>;
  deleteMediaFile(id: string): Promise<void>;
  deleteMediaFilesByDownloadId(downloadId: string): Promise<void>;
  deletePendingMediaFilesByDownloadId(downloadId: string): Promise<void>;

  // ── Blocklist ──

  findBlocklistByMediaId(mediaId: string): Promise<{ title: string }[]>;
  findBlocklistEntry(mediaId: string, title: string): Promise<BlocklistEntry | null>;
  createBlocklistEntry(input: NewBlocklistEntry): Promise<BlocklistEntry>;

  // ── Download profile / config ──

  /** Resolve the active download profile for a media using the precedence
   *  chain (media → folder → flavor default). Returns null when no profile
   *  applies. */
  findActiveDownloadProfile(
    args: ActiveProfileQuery,
  ): Promise<DownloadProfile | null>;

  /** Read the admin download config row (scoring rules + admin policy). */
  findDownloadConfig(): Promise<DownloadConfig>;

  /** Hydrate the per-flavor, per-tier set maps the scoring engine consumes. */
  findReleaseGroupLookups(): Promise<ReleaseGroupLookups>;
}
