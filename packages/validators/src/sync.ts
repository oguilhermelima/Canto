import { z } from "zod";

export const listSyncedItemsInput = z.object({
  libraryId: z.string().uuid().optional(),
  source: z.enum(["jellyfin", "plex"]).optional(),
  result: z.enum(["imported", "skipped", "failed"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListSyncedItemsInput = z.infer<typeof listSyncedItemsInput>;

export const searchForSyncItemInput = z.object({
  query: z.string().min(1),
});
export type SearchForSyncItemInput = z.infer<typeof searchForSyncItemInput>;

export const resolveSyncItemInput = z.object({
  syncItemId: z.string().uuid(),
  tmdbId: z.number().int(),
  type: z.enum(["movie", "show"]),
});
export type ResolveSyncItemInput = z.infer<typeof resolveSyncItemInput>;

export const discoverServerLibrariesInput = z.object({
  serverType: z.enum(["jellyfin", "plex"]),
});
export type DiscoverServerLibrariesInput = z.infer<typeof discoverServerLibrariesInput>;
