import { and, eq, or, isNull, desc, asc, count, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { list, listItem, media } from "@canto/db/schema";
import type { RecsFilters } from "./user-recommendation-repository";

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

  // Fetch preview posters for each list (up to 4 most recently added)
  const previewRows = await db
    .select({
      listId: listItem.listId,
      posterPath: media.posterPath,
    })
    .from(listItem)
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(
      sql`${listItem.listId} IN (${sql.join(
        lists.map((l) => sql`${l.id}`),
        sql`, `,
      )})`,
    )
    .orderBy(desc(listItem.addedAt));

  const previewMap = new Map<string, string[]>();
  for (const r of previewRows) {
    if (!r.posterPath) continue;
    const arr = previewMap.get(r.listId) ?? [];
    if (arr.length < 4) {
      arr.push(r.posterPath);
      previewMap.set(r.listId, arr);
    }
  }

  return lists.map((l) => ({
    ...l,
    itemCount: countMap.get(l.id) ?? 0,
    previewPoster: previewMap.get(l.id)?.[0] ?? null,
    previewPosters: previewMap.get(l.id) ?? [],
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
  opts: { limit?: number; offset?: number } & RecsFilters = {},
) {
  const {
    limit: lim = 50, offset: off = 0,
    genreIds, genreMode = "or", language, scoreMin,
    yearMin, yearMax, runtimeMin, runtimeMax,
    certification, status, sortBy, watchProviders, watchRegion,
  } = opts;

  const conditions = [eq(listItem.listId, listId)];

  if (genreIds && genreIds.length > 0) {
    if (genreMode === "and") {
      conditions.push(sql`${media.genreIds}::jsonb @> ${JSON.stringify(genreIds)}::jsonb`);
    } else {
      conditions.push(sql`(${sql.join(genreIds.map((id) => sql`${media.genreIds}::jsonb @> ${JSON.stringify([id])}::jsonb`), sql` OR `)})`);
    }
  }
  if (language) conditions.push(eq(media.originalLanguage, language));
  if (scoreMin != null) conditions.push(sql`${media.voteAverage} >= ${scoreMin}`);
  if (yearMin) conditions.push(sql`${media.releaseDate} >= ${yearMin + "-01-01"}`);
  if (yearMax) conditions.push(sql`${media.releaseDate} <= ${yearMax + "-12-31"}`);
  if (runtimeMin != null) conditions.push(sql`${media.runtime} >= ${runtimeMin}`);
  if (runtimeMax != null) conditions.push(sql`${media.runtime} <= ${runtimeMax}`);
  if (certification) conditions.push(eq(media.contentRating, certification));
  if (status) conditions.push(eq(media.status, status));

  const wpIds = watchProviders ? watchProviders.split(/[,|]/).map(Number) : [];
  if (wpIds.length > 0 && watchRegion) {
    conditions.push(sql`${media.id} IN (
      SELECT media_id FROM media_watch_provider
      WHERE provider_id IN (${sql.join(wpIds.map(id => sql`${id}`), sql`, `)})
      AND region = ${watchRegion}
    )`);
  }

  let orderByExpr;
  switch (sortBy) {
    case "vote_average.desc": orderByExpr = [desc(media.voteAverage)]; break;
    case "vote_average.asc": orderByExpr = [asc(media.voteAverage)]; break;
    case "primary_release_date.desc": orderByExpr = [desc(media.releaseDate)]; break;
    case "primary_release_date.asc": orderByExpr = [asc(media.releaseDate)]; break;
    case "title.asc": orderByExpr = [asc(media.title)]; break;
    case "title.desc": orderByExpr = [desc(media.title)]; break;
    default: orderByExpr = [desc(listItem.addedAt)];
  }

  return db
    .select({
      listItem: listItem,
      media: media,
    })
    .from(listItem)
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(and(...conditions))
    .orderBy(...orderByExpr)
    .limit(lim)
    .offset(off);
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

/** Returns externalId+provider for all media items in the user's lists (watchlist + custom). */
export async function findUserListExternalIds(
  db: Database,
  userId: string,
) {
  return db
    .select({
      externalId: media.externalId,
      provider: media.provider,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(
      and(
        eq(list.userId, userId),
        // exclude server library — already handled by findLibraryExternalIds
        sql`${list.type} != 'server'`,
      ),
    )
    .groupBy(media.externalId, media.provider);
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
