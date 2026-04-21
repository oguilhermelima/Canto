export { downloadTorrent, coreDownload } from "./core";
export type { DownloadInput, CoreDownloadOptions } from "./core";
export { replaceTorrent } from "./replace";
export type { ReplaceInput } from "./replace";
export { resolveDownloadConfig } from "./folder-resolution";
export type { ResolvedDownloadConfig, RoutableMediaRow } from "./folder-resolution";
export { resolveEpisodeIds, detectDuplicates } from "./duplicate-detection";
export type { EpisodeRef, MediaRowForDuplicates } from "./duplicate-detection";
