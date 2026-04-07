import type { syncItem, syncEpisode } from "@canto/db/schema";

type SyncItemRow = typeof syncItem.$inferSelect;
type SyncItemInsert = typeof syncItem.$inferInsert;
type SyncEpisodeRow = typeof syncEpisode.$inferSelect;
type SyncEpisodeInsert = typeof syncEpisode.$inferInsert;

export interface SyncItemFilters {
  libraryId?: string;
  source?: string;
  result?: string;
}

export interface SyncRepositoryPort {
  findSyncItemById(id: string): Promise<SyncItemRow | undefined>;

  findSyncItemsByMediaId(
    mediaId: string,
  ): Promise<Array<{ source: string; jellyfinItemId: string | null; plexRatingKey: string | null }>>;

  findSyncItemsPaginated(
    filters: SyncItemFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: SyncItemRow[]; total: number }>;

  findSyncItemsWithEpisodes(
    mediaId: string,
  ): Promise<Array<SyncItemRow & { episodes: SyncEpisodeRow[] }>>;

  updateSyncItem(id: string, data: Partial<SyncItemInsert>): Promise<void>;
  deleteSyncItemsByLibraryIds(libraryIds: string[], source?: string): Promise<void>;
  createSyncItem(data: SyncItemInsert): Promise<SyncItemRow | undefined>;
  createSyncEpisodes(episodes: SyncEpisodeInsert[]): Promise<void>;

  findSyncItemByServerKey(
    source: string,
    libraryId: string | null | undefined,
    jellyfinItemId?: string,
    plexRatingKey?: string,
    serverLinkId?: string,
  ): Promise<SyncItemRow | undefined>;

  upsertSyncItemByServerKey(data: SyncItemInsert): Promise<SyncItemRow | undefined>;

  pruneOldSyncItems(
    libraryIds: string[],
    source: string,
    cutoffDate: Date,
    serverLinkIds?: string[],
  ): Promise<void>;

  deleteSyncEpisodesBySyncItemId(syncItemId: string): Promise<void>;
}
