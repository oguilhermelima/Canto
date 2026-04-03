import { z } from "zod";

export const sourceType = z.enum(["cam", "telesync", "webrip", "webdl", "bluray", "remux", "hdtv", "unknown"]);
export const qualityType = z.enum(["uhd", "fullhd", "hd", "sd", "unknown"]);

export const torrentSearchInput = z.object({
  mediaId: z.string().uuid(),
  query: z.string().min(1).optional(),
  seasonNumber: z.number().int().nonnegative().optional(),
  episodeNumbers: z.array(z.number().int().positive()).nullish(),
  page: z.number().int().nonnegative().default(0),
  pageSize: z.number().int().min(10).max(200).default(50),
});
export type TorrentSearchInput = z.infer<typeof torrentSearchInput>;

export const torrentDownloadInput = z.object({
  mediaId: z.string().uuid(),
  magnetUrl: z.string().url().optional(),
  torrentUrl: z.string().url().optional(),
  title: z.string().min(1),
  seasonNumber: z.number().int().nonnegative().optional(),
  episodeNumbers: z.array(z.number().int().positive()).optional(),
});
export type TorrentDownloadInput = z.infer<typeof torrentDownloadInput>;
