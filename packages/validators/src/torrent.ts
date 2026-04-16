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
  /** Explicit download folder override. If omitted, auto-resolved via rules. */
  folderId: z.string().uuid().optional(),
});
export type TorrentDownloadInput = z.infer<typeof torrentDownloadInput>;

export const torrentReplaceInput = z.object({
  replaceFileIds: z.array(z.string().uuid()),
  mediaId: z.string().uuid(),
  title: z.string().min(1),
  magnetUrl: z.string().url().optional(),
  torrentUrl: z.string().url().optional(),
  seasonNumber: z.number().int().nonnegative().optional(),
  episodeNumbers: z.array(z.number().int().positive()).optional(),
});
export type TorrentReplaceInput = z.infer<typeof torrentReplaceInput>;

export const listLiveTorrentsInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.number().int().min(0).default(0),
});
export type ListLiveTorrentsInput = z.infer<typeof listLiveTorrentsInput>;

export const deleteTorrentInput = z.object({
  id: z.string().uuid(),
  deleteFiles: z.boolean().default(false),
  removeTorrent: z.boolean().default(true),
});
export type DeleteTorrentInput = z.infer<typeof deleteTorrentInput>;

export const renameTorrentInput = z.object({
  id: z.string().uuid(),
  newName: z.string().min(1),
});
export type RenameTorrentInput = z.infer<typeof renameTorrentInput>;

export const moveTorrentInput = z.object({
  id: z.string().uuid(),
  newPath: z.string().min(1),
});
export type MoveTorrentInput = z.infer<typeof moveTorrentInput>;

export const addMagnetInput = z.object({
  magnetUrl: z.string().trim().startsWith("magnet:"),
});
export type AddMagnetInput = z.infer<typeof addMagnetInput>;

export const addTorrentFileInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileBase64: z.string().min(1),
});
export type AddTorrentFileInput = z.infer<typeof addTorrentFileInput>;

export const importFromClientInput = z.object({
  hash: z.string().trim().min(1),
  mediaExternalId: z.number().int().positive(),
  mediaProvider: z.enum(["tmdb", "tvdb"]),
  mediaType: z.enum(["movie", "show"]),
  downloadType: z.enum(["movie", "season", "episode"]),
  seasonNumber: z.number().int().positive().optional(),
  episodeNumbers: z.array(z.number().int().positive()).optional(),
}).superRefine((data, ctx) => {
  if (data.downloadType === "episode") {
    if (!data.seasonNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seasonNumber"],
        message: "seasonNumber is required when downloadType is episode",
      });
    }
    if (!data.episodeNumbers || data.episodeNumbers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["episodeNumbers"],
        message: "episodeNumbers is required when downloadType is episode",
      });
    }
  }
});
export type ImportFromClientInput = z.infer<typeof importFromClientInput>;
