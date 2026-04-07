import type { list, listItem, media } from "@canto/db/schema";
import type { RecsFilters } from "./user-recommendation-repository.port";

type ListRow = typeof list.$inferSelect;
type ListInsert = typeof list.$inferInsert;
type ListItemRow = typeof listItem.$inferSelect;
type ListItemInsert = typeof listItem.$inferInsert;
type MediaRow = typeof media.$inferSelect;

export interface ListRepositoryPort {
  findUserLists(userId: string): Promise<ListRow[]>;

  findUserListsWithCounts(
    userId: string,
  ): Promise<
    Array<
      ListRow & {
        itemCount: number;
        previewPoster: string | null;
        previewPosters: string[];
      }
    >
  >;

  findListBySlug(slug: string, userId: string): Promise<ListRow | undefined>;
  findListById(id: string): Promise<ListRow | undefined>;
  createList(data: ListInsert): Promise<ListRow>;
  updateList(
    id: string,
    data: Partial<Pick<ListInsert, "name" | "slug" | "description" | "position">>,
  ): Promise<ListRow | undefined>;
  deleteList(id: string): Promise<void>;
  findServerLibrary(): Promise<ListRow | undefined>;
  ensureServerLibrary(): Promise<ListRow>;

  // List Items
  findListItems(
    listId: string,
    opts?: { limit?: number; offset?: number } & RecsFilters,
  ): Promise<{ items: Array<{ listItem: ListItemRow; media: MediaRow }>; total: number }>;

  addListItem(data: ListItemInsert): Promise<ListItemRow | undefined>;
  removeListItem(listId: string, mediaId: string): Promise<void>;

  findMediaInLists(
    mediaId: string,
    userId: string,
  ): Promise<
    Array<{ listId: string; listName: string; listSlug: string; listType: string }>
  >;

  findUserListExternalIds(
    userId: string,
  ): Promise<Array<{ externalId: number; provider: string }>>;

  isMediaInServerLibrary(mediaId: string): Promise<boolean>;
}
