export function sanitizeTorrentTitleForSearch(title: string): string {
  return title
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(2160p|1080p|720p|x264|x265|h\.?264|h\.?265|hevc|hdr|webrip|web[- ]?dl|bluray|remux|dvdrip|proper|repack|multi|dubbed)\b/gi, " ")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
