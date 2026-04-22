export { downloadTorrent, coreDownload } from "./download-torrent/core";
export type { DownloadInput, CoreDownloadOptions } from "./download-torrent/core";
export { replaceTorrent } from "./download-torrent/replace";
export type { ReplaceInput } from "./download-torrent/replace";
export { resolveDownloadConfig } from "./download-torrent/folder-resolution";
export type { ResolvedDownloadConfig, RoutableMediaRow } from "./download-torrent/folder-resolution";
export { resolveEpisodeIds, detectDuplicates } from "./download-torrent/duplicate-detection";
export type { EpisodeRef, MediaRowForDuplicates } from "./download-torrent/duplicate-detection";
