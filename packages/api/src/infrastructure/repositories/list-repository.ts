import { and, eq, or, isNull, desc, count, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { list, listItem } from "@canto/db/schema";

// ── Lists ──

export async function findUserLists(db: Database, userId: string) {
  return db.query.list.findMany({
    where: or(eq(list.userId, userId), eq(list.type, "server")),
    orderBy: [desc(list.isSystem), list.position],
  });
}

export async function findUserListsWithCounts(
  db: Database,
  userId: string,
) {
  const lists = await db.query.list.findMany({
    where: or(eq(list.userId, userId), eq(list.type, "server")),
    orderBy: [desc(list.isSystem), list.position],
  });

  if (lists.length === 0) return [];

  const counts = await db
    .select({
      listId: listItem.listId,
      count: count(),
    })
    .from(listItem)
    .where(
      sql`${listItem.listId} IN (${sql.join(
        lists.map((l) => sql`${l.id}`),
        sql`, `,
      )})`,
    )
    .groupBy(listItem.listId);

  const countMap = new Map(counts.map((c) => [c.listId, c.count]));

  return lists.map((l) => ({
    ...l,
    itemCount: countMap.get(l.id) ?? 0,
  }));
}

export async function findListBySlug(
  db: Database,
  slug: string,
  userId: string,
) {
  // Server library has no userId
  return db.query.list.findFirst({
    where: and(
      eq(list.slug, slug),
      slug === "server-library"
        ? isNull(list.userId)
        : eq(list.userId, userId),
    ),
  });
}

export async function findListById(db: Database, id: string) {
  return db.query.list.findFirst({
    where: eq(list.id, id),
  });
}

export async function createList(
  db: Database,
  data: typeof list.$inferInsert,
) {
  const [row] = await db.insert(list).values(data).returning();
  return row!;
}

export async function updateList(
  db: Database,
  id: string,
  data: Partial<Pick<typeof list.$inferInsert, "name" | "slug" | "description" | "position">>,
) {
  const [row] = await db
    .update(list)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(list.id, id))
    .returning();
  return row;
}

export async function deleteList(db: Database, id: string) {
  await db.delete(list).where(eq(list.id, id));
}

export async function findServerLibrary(db: Database) {
  return db.query.list.findFirst({
    where: eq(list.type, "server"),
  });
}

export async function ensureServerLibrary(db: Database) {
  const existing = await findServerLibrary(db);
  if (existing) return existing;

  // Use onConflictDoNothing to handle concurrent inserts safely
  const [row] = await db
    .insert(list)
    .values({
      name: "Server Library",
      slug: "server-library",
      type: "server",
      isSystem: true,
    })
    .onConflictDoNothing()
    .returning();

  // If conflict occurred, the row wasn't returned — re-fetch
  if (!row) {
    const refetched = await findServerLibrary(db);
    if (!refetched) throw new Error("Failed to create or find server library");
    return refetched;
  }
  return row;
}

// ── List Items ──

export async function findListItems(
  db: Database,
  listId: string,
  opts?: { limit?: number; offset?: number },
) {
  return db.query.listItem.findMany({
    where: eq(listItem.listId, listId),
    with: { media: true },
    orderBy: [desc(listItem.addedAt)],
    limit: opts?.limit ?? 50,
    offset: opts?.offset ?? 0,
  });
}

export async function addListItem(
  db: Database,
  data: typeof listItem.$inferInsert,
) {
  const [row] = await db
    .insert(listItem)
    .values(data)
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function removeListItem(
  db: Database,
  listId: string,
  mediaId: string,
) {
  await db
    .delete(listItem)
    .where(and(eq(listItem.listId, listId), eq(listItem.mediaId, mediaId)));
}

export async function findMediaInLists(
  db: Database,
  mediaId: string,
  userId: string,
) {
  const items = await db
    .select({
      listId: listItem.listId,
      listName: list.name,
      listSlug: list.slug,
      listType: list.type,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .where(
      and(
        eq(listItem.mediaId, mediaId),
        or(eq(list.userId, userId), eq(list.type, "server")),
      ),
    );
  return items;
}

export async function isMediaInServerLibrary(
  db: Database,
  mediaId: string,
): Promise<boolean> {
  const serverLib = await findServerLibrary(db);
  if (!serverLib) return false;

  const item = await db.query.listItem.findFirst({
    where: and(
      eq(listItem.listId, serverLib.id),
      eq(listItem.mediaId, mediaId),
    ),
  });
  return !!item;
}
