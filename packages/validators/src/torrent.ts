import { z } from "zod";

export const torrentSearchInput = z.object({
  mediaId: z.string().uuid(),
  seasonNumber: z.number().int().nonnegative().optional(),
});
export type TorrentSearchInput = z.infer<typeof torrentSearchInput>;

export const torrentDownloadInput = z.object({
  mediaId: z.string().uuid(),
  magnetUrl: z.string().url().optional(),
  torrentUrl: z.string().url().optional(),
  title: z.string().min(1),
});
export type TorrentDownloadInput = z.infer<typeof torrentDownloadInput>;
