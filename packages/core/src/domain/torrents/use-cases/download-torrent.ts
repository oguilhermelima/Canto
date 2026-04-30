export {
  downloadTorrent,
  coreDownload,
} from "@canto/core/domain/torrents/use-cases/download-torrent/core";
export type {
  DownloadInput,
  CoreDownloadOptions,
} from "@canto/core/domain/torrents/use-cases/download-torrent/core";
export { replaceTorrent } from "@canto/core/domain/torrents/use-cases/download-torrent/replace";
export type { ReplaceInput } from "@canto/core/domain/torrents/use-cases/download-torrent/replace";
export { resolveDownloadConfig } from "@canto/core/domain/torrents/use-cases/download-torrent/folder-resolution";
export type {
  ResolvedDownloadConfig,
  RoutableMediaRow,
} from "@canto/core/domain/torrents/use-cases/download-torrent/folder-resolution";
export {
  resolveEpisodeIds,
  detectDuplicates,
} from "@canto/core/domain/torrents/use-cases/download-torrent/duplicate-detection";
export type {
  EpisodeRef,
  MediaRowForDuplicates,
} from "@canto/core/domain/torrents/use-cases/download-torrent/duplicate-detection";
