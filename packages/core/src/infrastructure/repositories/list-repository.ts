import { and, asc, eq, or, isNull, desc, count, sql, inArray, max, type SQL } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { list, listItem, listMember, media, mediaTranslation, folderServerLink, userConnection, userMediaLibrary, userMediaState } from "@canto/db/schema";
import type { RecsFilters } from "../../domain/types/recs-filters";
import { buildRecsFilterConditions, recsSortOrder } from "./shared/recs-filter-builder";
import { getUserLanguage } from "../../domain/services/user-service";

// ── Lists ──

export async function findUserLists(db: Database, userId: string) {
  // Include lists owned by user, server lists, and lists where user is a member
  const memberListIds = db
    .select({ listId: listMember.listId })
    .from(listMember)
    .where(eq(listMember.userId, userId));

  return db.query.list.findMany({
    where: or(
      eq(list.userId, userId),
      eq(list.type, "server"),
      sql`${list.id} IN (${memberListIds})`,
    ),
    orderBy: [list.position],
  });
}

export async function findUserListsWithCounts(
  db: Database,
  userId: string,
) {
  const memberListIds = db
    .select({ listId: listMember.listId })
    .from(listMember)
    .where(eq(listMember.userId, userId));

  const lists = await db.query.list.findMany({
    where: or(
      eq(list.userId, userId),
      eq(list.type, "server"),
      sql`${list.id} IN (${memberListIds})`,
    ),
    orderBy: [list.position],
  });

  if (lists.length === 0) return [];

  const serverListIds = lists.filter((l) => l.type === "server").map((l) => l.id);
  const nonServerListIds = lists.filter((l) => l.type !== "server").map((l) => l.id);

  const userLang = await getUserLanguage(db, userId);
  const translationJoin = and(
    eq(mediaTranslation.mediaId, media.id),
    eq(mediaTranslation.language, userLang),
  );
  const localizedPosterPath = sql<string | null>`COALESCE(${mediaTranslation.posterPath}, ${media.posterPath})`;

  const countMap = new Map<string, number>();
  const previewMap = new Map<string, string[]>();

  const accumulatePreview = (listId: string, posterPath: string | null): void => {
    if (!posterPath) return;
    const arr = previewMap.get(listId) ?? [];
    if (arr.length < 4) {
      arr.push(posterPath);
      previewMap.set(listId, arr);
    }
  };

  if (nonServerListIds.length > 0) {
    const [countRows, previewRows] = await Promise.all([
      db
        .select({ listId: listItem.listId, count: count() })
        .from(listItem)
        .where(inArray(listItem.listId, nonServerListIds))
        .groupBy(listItem.listId),
      db
        .select({
          listId: listItem.listId,
          posterPath: localizedPosterPath,
        })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mediaTranslation, translationJoin)
        .where(inArray(listItem.listId, nonServerListIds))
        .orderBy(asc(listItem.position), desc(listItem.addedAt)),
    ]);

    for (const c of countRows) countMap.set(c.listId, c.count);
    for (const r of previewRows) accumulatePreview(r.listId, r.posterPath);
  }

  if (serverListIds.length > 0) {
    const userServerJoin = and(
      eq(userMediaLibrary.mediaId, listItem.mediaId),
      eq(userMediaLibrary.userId, userId),
    );

    const [countRows, previewRows] = await Promise.all([
      db
        .select({
          listId: listItem.listId,
          count: sql<number>`COUNT(DISTINCT ${listItem.mediaId})`.mapWith(Number),
        })
        .from(listItem)
        .innerJoin(userMediaLibrary, userServerJoin)
        .where(inArray(listItem.listId, serverListIds))
        .groupBy(listItem.listId),
      db
        .select({
          listId: listItem.listId,
          mediaId: listItem.mediaId,
          posterPath: localizedPosterPath,
          position: listItem.position,
          addedAt: listItem.addedAt,
        })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .innerJoin(userMediaLibrary, userServerJoin)
        .leftJoin(mediaTranslation, translationJoin)
        .where(inArray(listItem.listId, serverListIds))
        .orderBy(asc(listItem.position), desc(listItem.addedAt)),
    ]);

    for (const c of countRows) countMap.set(c.listId, c.count);

    const seenPerList = new Map<string, Set<string>>();
    for (const r of previewRows) {
      const seen = seenPerList.get(r.listId) ?? new Set<string>();
      if (seen.has(r.mediaId)) continue;
      seen.add(r.mediaId);
      seenPerList.set(r.listId, seen);
      accumulatePreview(r.listId, r.posterPath);
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
  if (slug === "server-library") {
    return db.query.list.findFirst({
      where: and(eq(list.slug, slug), isNull(list.userId)),
    });
  }

  const owned = await db.query.list.findFirst({
    where: and(eq(list.slug, slug), eq(list.userId, userId)),
  });
  if (owned) return owned;

  const memberListIds = db
    .select({ listId: listMember.listId })
    .from(listMember)
    .where(eq(listMember.userId, userId));

  return db.query.list.findFirst({
    where: and(
      eq(list.slug, slug),
      sql`${list.id} IN (${memberListIds})`,
    ),
  });
}

export async function findListById(db: Database, id: string) {
  return db.query.list.findFirst({
    where: eq(list.id, id),
  });
}

export async function getMaxListPosition(db: Database, userId: string | null): Promise<number> {
  const condition = userId
    ? or(eq(list.userId, userId), eq(list.type, "server"))
    : eq(list.type, "server");
  const [row] = await db
    .select({ maxPos: max(list.position) })
    .from(list)
    .where(condition);
  return row?.maxPos ?? -1;
}

export async function createList(
  db: Database,
  data: typeof list.$inferInsert,
) {
  const nextPos = await getMaxListPosition(db, data.userId ?? null) + 1;
  const [row] = await db.insert(list).values({ ...data, position: nextPos }).returning();
  return row!;
}

export async function updateList(
  db: Database,
  id: string,
  data: Partial<Pick<typeof list.$inferInsert, "name" | "slug" | "description" | "position" | "visibility">>,
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

export async function reorderLists(
  db: Database,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(list)
        .set({ position: i, updatedAt: new Date() })
        .where(
          and(
            eq(list.id, orderedIds[i]!),
            or(eq(list.userId, userId), eq(list.type, "server")),
          ),
        );
    }
  });
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
  opts: {
    userId?: string;
    limit?: number;
    offset?: number;
    watchStatus?: "in_progress" | "completed" | "not_started";
  } & RecsFilters = {},
) {
  const {
    userId,
    limit: lim = 50,
    offset: off = 0,
    sortBy,
    membersRatingMin,
    memberVoteCountMin,
    watchStatus,
    ...filterOpts
  } = opts;

  const listRow = await findListById(db, listId);
  const isServerLibrary = listRow?.type === "server";

  // Collect member userIds for vote aggregation (members + owner)
  const memberRows = await db
    .select({ userId: listMember.userId })
    .from(listMember)
    .where(eq(listMember.listId, listId));
  const memberUserIds = memberRows.map((m) => m.userId);
  if (listRow?.userId) memberUserIds.push(listRow.userId);

  const memberVotesSubquery = db
    .select({
      mediaId: userMediaState.mediaId,
      totalRating: sql<number>`COALESCE(SUM(${userMediaState.rating}), 0)`.as("member_total_rating"),
      voteCount: sql<number>`COUNT(${userMediaState.rating})`.as("member_vote_count"),
      avgRating: sql<number>`CAST(COALESCE(SUM(${userMediaState.rating}), 0) AS float) / NULLIF(COUNT(${userMediaState.rating}), 0)`.as("member_avg_rating"),
    })
    .from(userMediaState)
    .where(
      memberUserIds.length > 0
        ? and(
            inArray(userMediaState.userId, memberUserIds),
            sql`${userMediaState.rating} IS NOT NULL`,
          )
        : sql`FALSE`,
    )
    .groupBy(userMediaState.mediaId)
    .as("member_votes");

  const conditions: SQL[] = [
    eq(listItem.listId, listId),
    ...buildRecsFilterConditions(filterOpts),
  ];

  if (isServerLibrary && userId) {
    // Use the canonical user_media_library table to determine what's in this user's server library.
    // This is cleaner than the old sync_item-based approach and avoids duplicates.
    const accessibleMediaIds = db
      .select({ mediaId: userMediaLibrary.mediaId })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.userId, userId));

    conditions.push(sql`${listItem.mediaId} IN (${accessibleMediaIds})`);
  }

  if (membersRatingMin != null) {
    conditions.push(sql`COALESCE(${memberVotesSubquery.avgRating}, 0) >= ${membersRatingMin}`);
  }
  if (memberVoteCountMin != null) {
    conditions.push(sql`COALESCE(${memberVotesSubquery.voteCount}, 0) >= ${memberVoteCountMin}`);
  }

  const joinCurrentUserState = !!userId;
  if (watchStatus && userId) {
    if (watchStatus === "in_progress") {
      conditions.push(sql`${userMediaState.status} = 'watching'`);
    } else if (watchStatus === "completed") {
      conditions.push(sql`${userMediaState.status} = 'completed'`);
    } else {
      // not_started: no state row OR status = 'planned'
      conditions.push(sql`(${userMediaState.status} IS NULL OR ${userMediaState.status} = 'planned')`);
    }
  }

  const orderByExpr = (() => {
    if (sortBy === "members_rating.desc") {
      return [sql`${memberVotesSubquery.avgRating} DESC NULLS LAST`];
    }
    if (sortBy === "members_rating.asc") {
      return [sql`${memberVotesSubquery.avgRating} ASC NULLS LAST`];
    }
    const customSort = recsSortOrder(sortBy);
    if (customSort) return [customSort];
    return [asc(listItem.position), desc(listItem.addedAt)];
  })();

  const whereClause = and(...conditions);

  const userStateJoin = joinCurrentUserState
    ? and(eq(userMediaState.mediaId, media.id), eq(userMediaState.userId, userId!))
    : null;

  const [rows, [countRow]] = await Promise.all([
    (userStateJoin
      ? db
          .select({
            listItem: listItem,
            media: media,
            memberTotalRating: memberVotesSubquery.totalRating,
            memberVoteCount: memberVotesSubquery.voteCount,
            memberAvgRating: memberVotesSubquery.avgRating,
            userRating: userMediaState.rating,
          })
          .from(listItem)
          .innerJoin(media, eq(listItem.mediaId, media.id))
          .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
          .leftJoin(userMediaState, userStateJoin)
      : db
          .select({
            listItem: listItem,
            media: media,
            memberTotalRating: memberVotesSubquery.totalRating,
            memberVoteCount: memberVotesSubquery.voteCount,
            memberAvgRating: memberVotesSubquery.avgRating,
          })
          .from(listItem)
          .innerJoin(media, eq(listItem.mediaId, media.id))
          .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
    )
      .where(whereClause)
      .orderBy(...orderByExpr)
      .limit(lim)
      .offset(off),
    (userStateJoin
      ? db
          .select({ total: count() })
          .from(listItem)
          .innerJoin(media, eq(listItem.mediaId, media.id))
          .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
          .leftJoin(userMediaState, userStateJoin)
      : db
          .select({ total: count() })
          .from(listItem)
          .innerJoin(media, eq(listItem.mediaId, media.id))
          .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
    ).where(whereClause),
  ]);

  const items = rows.map((row) => {
    const userRating =
      "userRating" in row && row.userRating != null
        ? Number(row.userRating)
        : null;
    return {
      listItem: row.listItem,
      media: row.media,
      memberVotes:
        row.memberVoteCount != null && Number(row.memberVoteCount) > 0
          ? {
              totalRating: Number(row.memberTotalRating ?? 0),
              voteCount: Number(row.memberVoteCount),
              avgRating: Number(row.memberAvgRating ?? 0),
            }
          : null,
      userRating: userRating as number | null,
    };
  });

  return { items, total: countRow?.total ?? 0 };
}

export async function addListItem(
  db: Database,
  data: typeof listItem.$inferInsert,
) {
  const [maxRow] = await db
    .select({ maxPos: max(listItem.position) })
    .from(listItem)
    .where(eq(listItem.listId, data.listId));
  const nextPos = (maxRow?.maxPos ?? -1) + 1;

  const [row] = await db
    .insert(listItem)
    .values({ ...data, position: nextPos })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function reorderListItems(
  db: Database,
  listId: string,
  orderedItemIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedItemIds.length; i++) {
      await tx
        .update(listItem)
        .set({ position: i })
        .where(
          and(
            eq(listItem.id, orderedItemIds[i]!),
            eq(listItem.listId, listId),
          ),
        );
    }
  });
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

/**
 * Reconcile the Server Library list with what's actually on media servers.
 * Adds missing items and removes items no longer on any server.
 */
export async function reconcileServerLibrary(
  db: Database,
  tag: string,
): Promise<void> {
  const serverLib = await ensureServerLibrary(db);

  // All media IDs confirmed on a server (imported torrents + synced versions)
  const onServerRows = await db.execute(sql`
    SELECT DISTINCT media_id::text FROM (
      SELECT media_id FROM torrent WHERE imported = true AND media_id IS NOT NULL
      UNION
      SELECT media_id FROM media_version WHERE result IN ('imported', 'skipped') AND media_id IS NOT NULL
    ) x
  `);
  const serverMediaIds = new Set(
    (onServerRows as unknown as Array<{ media_id: string }>).map((r) => r.media_id),
  );

  // Add missing items
  for (const mediaId of serverMediaIds) {
    await addListItem(db, { listId: serverLib.id, mediaId }).catch(() => { /* already in list */ });
  }

  // Remove items no longer on server
  if (serverMediaIds.size > 0) {
    const idsArray = [...serverMediaIds];
    await db.execute(sql`
      DELETE FROM list_item
      WHERE list_id = ${serverLib.id}::uuid
      AND media_id NOT IN (${sql.join(idsArray.map((id) => sql`${id}::uuid`), sql`, `)})
    `);
  }

  console.log(`[${tag}] Server Library reconciled: ${serverMediaIds.size} items`);
}
