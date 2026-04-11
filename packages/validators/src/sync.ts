import { z } from "zod";

export const syncResultEnum = z.enum([
  "imported",
  "skipped",
  "unmatched",
  "failed",
]);
export type SyncResult = z.infer<typeof syncResultEnum>;

export const mediaVersionGroupsTabEnum = z.enum([
  "all",
  "imported",
  "unmatched",
  "failed",
]);
export type MediaVersionGroupsTab = z.infer<typeof mediaVersionGroupsTabEnum>;

export const listMediaVersionGroupsInput = z.object({
  /** Filter by media server source. */
  server: z.enum(["jellyfin", "plex"]).optional(),
  /**
   * Which UI tab is active. Server computes the per-group aggregate status
   * and filters accordingly:
   *   - all       → matched groups + standalone unmatched rows
   *   - imported  → groups where every version is imported or skipped
   *   - unmatched → only standalone rows (media_id IS NULL, result=unmatched)
   *   - failed    → groups where any version is failed
   */
  tab: mediaVersionGroupsTabEnum.default("all"),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ListMediaVersionGroupsInput = z.infer<typeof listMediaVersionGroupsInput>;

export const searchForMediaVersionInput = z.object({
  query: z.string().min(1),
  type: z.enum(["movie", "show"]).optional(),
});
export type SearchForMediaVersionInput = z.infer<typeof searchForMediaVersionInput>;

/**
 * Manual "Fix match" input. Exactly one of `versionId` or `mediaId` must be
 * set — versionId re-points a single row, mediaId re-points every version
 * currently anchored to that media (the "fix parent" bulk action).
 */
export const resolveMediaVersionInput = z
  .object({
    versionId: z.string().uuid().optional(),
    mediaId: z.string().uuid().optional(),
    tmdbId: z.number().int(),
    type: z.enum(["movie", "show"]),
    updateMediaServer: z.boolean().optional().default(false),
    dryRun: z.boolean().optional().default(false),
  })
  .refine((v) => !!v.versionId !== !!v.mediaId, {
    message: "Exactly one of versionId or mediaId must be set",
  });
export type ResolveMediaVersionInput = z.infer<typeof resolveMediaVersionInput>;

export const deleteMediaVersionInput = z.object({
  versionId: z.string().uuid(),
});
export type DeleteMediaVersionInput = z.infer<typeof deleteMediaVersionInput>;

export const discoverServerLibrariesInput = z.object({
  serverType: z.enum(["jellyfin", "plex"]),
});
export type DiscoverServerLibrariesInput = z.infer<typeof discoverServerLibrariesInput>;
