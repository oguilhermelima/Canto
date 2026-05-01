import { and, asc, eq, getTableColumns, or, isNull, desc, count, sql, inArray, max  } from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { list, listItem, listMember, media, user, userHiddenMedia, userMediaLibrary, userMediaState } from "@canto/db/schema";
import type { CollectionWatchStatus } from "@canto/validators";
import type { RecsFilters } from "../../domain/recommendations/types/recs-filters";
import { buildRecsFilterConditions, recsSortOrder } from "../recommendations/recs-filter-builder";
import { mediaI18n  } from "../shared/media-i18n";
import type {MediaI18n} from "../shared/media-i18n";

/** Build the column-set rec-filter conditions and sort use against the
 *  `media + mediaI18n` join shape in this repo. */
function recsFilterColumnsForMedia(mi: MediaI18n) {
  return {
    id: media.id,
    title: mi.title,
    genreIds: media.genreIds,
    originalLanguage: media.originalLanguage,
    voteAverage: media.voteAverage,
    releaseDate: media.releaseDate,
    runtime: media.runtime,
    contentRating: media.contentRating,
    status: media.status,
  };
}

/** Live row predicate: skip soft-deleted (tombstoned) rows. Centralised so
 *  every read on `list_item` opts in consistently. */
const isLiveListItem = isNull(listItem.deletedAt);

/** Build a SQL condition for the multi-select collection watch-status filter.
 *  `none` → row missing or `status IS NULL`; the others map 1:1 to the DB. */
function buildWatchStatusesCondition(
  statuses: CollectionWatchStatus[] | undefined,
): SQL | null {
  if (!statuses || statuses.length === 0) return null;
  const dbStatuses = statuses.filter((s): s is Exclude<CollectionWatchStatus, "none"> => s !== "none");
  const includeNone = statuses.includes("none");
  const inExpr = dbStatuses.length
    ? sql`${userMediaState.status} IN (${sql.join(dbStatuses.map((s) => sql`${s}`), sql`, `)})`
    : null;
  if (inExpr && includeNone) return sql`(${userMediaState.status} IS NULL OR ${inExpr})`;
  if (inExpr) return inExpr;
  return sql`${userMediaState.status} IS NULL`;
}

// ── Lists ──

export async function findUserLists(db: Database, userId: string) {
  // Include lists owned by user, server lists, and lists where user is a member
  const memberListIds = db
    .select({ listId: listMember.listId })
    .from(listMember)
    .where(eq(listMember.userId, userId));

  return db.query.list.findMany({
    where: and(
      isNull(list.deletedAt),
      or(
        eq(list.userId, userId),
        eq(list.type, "server"),
        sql`${list.id} IN (${memberListIds})`,
      ),
    ),
    orderBy: [list.position],
  });
}

/**
 * `userLang` should be read off `ctx.session.user.language` by the caller —
 * the previous implementation issued an extra `SELECT language FROM user` per
 * call even though every caller already had the value on the session.
 */
export async function findUserListsWithCounts(
  db: Database,
  userId: string,
  userLang: string,
) {
  const memberListIds = db
    .select({ listId: listMember.listId })
    .from(listMember)
    .where(eq(listMember.userId, userId));

  const lists = await db.query.list.findMany({
    where: and(
      isNull(list.deletedAt),
      or(
        eq(list.userId, userId),
        eq(list.type, "server"),
        sql`${list.id} IN (${memberListIds})`,
      ),
    ),
    orderBy: [list.position],
  });

  if (lists.length === 0) return [];

  const serverListIds = lists.filter((l) => l.type === "server").map((l) => l.id);
  const nonServerListIds = lists.filter((l) => l.type !== "server").map((l) => l.id);

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
        .where(and(inArray(listItem.listId, nonServerListIds), isLiveListItem))
        .groupBy(listItem.listId),
      // Top-4-per-list via window function — pulls 4N rows total instead of all
      // list_item rows. The previous version fetched the full list and trimmed
      // to 4 in JS, so a 1k-item list cost 1k rows + 1k translation joins.
      // COALESCE chain: user-lang localization → en-US fallback (post-1C-δ
      // base media has no poster_path).
      db.execute<{ list_id: string; poster_path: string | null }>(sql`
        SELECT list_id, poster_path FROM (
          SELECT li.list_id,
                 COALESCE(ml.poster_path, ml_en.poster_path) AS poster_path,
                 ROW_NUMBER() OVER (
                   PARTITION BY li.list_id
                   ORDER BY li.position ASC, li.added_at DESC
                 ) AS rn
          FROM list_item li
          INNER JOIN media m ON m.id = li.media_id
          LEFT JOIN media_localization ml
                 ON ml.media_id = m.id AND ml.language = ${userLang}
          LEFT JOIN media_localization ml_en
                 ON ml_en.media_id = m.id AND ml_en.language = 'en-US'
          WHERE li.list_id IN (${sql.join(nonServerListIds.map((id) => sql`${id}::uuid`), sql`, `)})
            AND li.deleted_at IS NULL
        ) ranked
        WHERE rn <= 4
        ORDER BY list_id, rn
      `),
    ]);

    for (const c of countRows) countMap.set(c.listId, c.count);
    for (const r of previewRows as Array<{ list_id: string; poster_path: string | null }>) {
      accumulatePreview(r.list_id, r.poster_path);
    }
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
        .where(and(inArray(listItem.listId, serverListIds), isLiveListItem))
        .groupBy(listItem.listId),
      db.execute<{ list_id: string; poster_path: string | null }>(sql`
        SELECT list_id, poster_path FROM (
          SELECT li.list_id,
                 COALESCE(ml.poster_path, ml_en.poster_path) AS poster_path,
                 ROW_NUMBER() OVER (
                   PARTITION BY li.list_id
                   ORDER BY li.position ASC, li.added_at DESC
                 ) AS rn
          FROM list_item li
          INNER JOIN media m ON m.id = li.media_id
          INNER JOIN user_media_library uml
                 ON uml.media_id = li.media_id AND uml.user_id = ${userId}
          LEFT JOIN media_localization ml
                 ON ml.media_id = m.id AND ml.language = ${userLang}
          LEFT JOIN media_localization ml_en
                 ON ml_en.media_id = m.id AND ml_en.language = 'en-US'
          WHERE li.list_id IN (${sql.join(serverListIds.map((id) => sql`${id}::uuid`), sql`, `)})
            AND li.deleted_at IS NULL
        ) ranked
        WHERE rn <= 4
        ORDER BY list_id, rn
      `),
    ]);

    for (const c of countRows) countMap.set(c.listId, c.count);
    for (const r of previewRows as Array<{ list_id: string; poster_path: string | null }>) {
      accumulatePreview(r.list_id, r.poster_path);
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
      where: and(eq(list.slug, slug), isNull(list.userId), isNull(list.deletedAt)),
    });
  }

  const owned = await db.query.list.findFirst({
    where: and(eq(list.slug, slug), eq(list.userId, userId), isNull(list.deletedAt)),
  });
  if (owned) return owned;

  const memberListIds = db
    .select({ listId: listMember.listId })
    .from(listMember)
    .where(eq(listMember.userId, userId));

  return db.query.list.findFirst({
    where: and(
      eq(list.slug, slug),
      isNull(list.deletedAt),
      sql`${list.id} IN (${memberListIds})`,
    ),
  });
}

export async function findPublicListBySlug(
  db: Database,
  slug: string,
  ownerUserId: string,
) {
  return db.query.list.findFirst({
    where: and(
      eq(list.slug, slug),
      eq(list.userId, ownerUserId),
      eq(list.visibility, "public"),
      isNull(list.deletedAt),
    ),
  });
}

export async function findListById(db: Database, id: string) {
  return db.query.list.findFirst({
    where: and(eq(list.id, id), isNull(list.deletedAt)),
  });
}

/** Find a list by id ignoring tombstones — for the worker that processes
 *  pending Trakt deletions. UI/API callers should always use findListById. */
export async function findListByIdIncludingDeleted(db: Database, id: string) {
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

export async function findUserDefaultVisibility(
  db: Database,
  userId: string,
): Promise<"public" | "private"> {
  const [row] = await db
    .select({ isPublic: user.isPublic })
    .from(user)
    .where(eq(user.id, userId));
  return row?.isPublic ? "public" : "private";
}

export async function findListOwnerSummary(db: Database, ownerId: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image })
    .from(user)
    .where(eq(user.id, ownerId));
  return row ?? null;
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
  data: Partial<
    Pick<
      typeof list.$inferInsert,
      | "name"
      | "slug"
      | "description"
      | "position"
      | "visibility"
      | "defaultSortBy"
      | "groupByStatus"
      | "hideCompleted"
      | "hideDropped"
      | "showHidden"
    >
  >,
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
    where: and(eq(list.type, "server"), isNull(list.deletedAt)),
  });
}

/** Lists pending Trakt deletion — drives the worker sweeper. */
export async function findTombstonedTraktLists(db: Database) {
  return db
    .select({ id: list.id, deletedAt: list.deletedAt })
    .from(list)
    .where(sql`${list.deletedAt} IS NOT NULL`);
}

/** Live custom lists for a user, ordered by creation. Used by Trakt sync to
 *  walk the locally-owned custom collections. */
export async function findUserCustomLists(db: Database, userId: string) {
  return db.query.list.findMany({
    where: and(
      eq(list.userId, userId),
      eq(list.type, "custom"),
      isNull(list.deletedAt),
    ),
    orderBy: [asc(list.createdAt)],
  });
}

/** Tombstoned list ids for a user — set used by Trakt sync to skip rows
 *  awaiting deletion via the trakt-list-delete worker. */
export async function findUserTombstonedListIds(
  db: Database,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: list.id })
    .from(list)
    .where(and(eq(list.userId, userId), sql`${list.deletedAt} IS NOT NULL`));
  return rows.map((r) => r.id);
}

/** Live list of a specific type owned by a user (e.g. the user's watchlist). */
export async function findUserListByType(
  db: Database,
  userId: string,
  type: "watchlist" | "custom" | "server",
) {
  return db.query.list.findFirst({
    where: and(
      eq(list.userId, userId),
      eq(list.type, type),
      isNull(list.deletedAt),
    ),
  });
}

export async function softDeleteList(db: Database, id: string): Promise<void> {
  // Rename slug so the unique (userId, slug) index doesn't block the user from
  // re-creating a list with the same slug while the tombstone awaits the worker.
  const now = new Date();
  await db
    .update(list)
    .set({
      deletedAt: now,
      updatedAt: now,
      slug: sql`${list.slug} || '-deleted-' || EXTRACT(EPOCH FROM NOW())::bigint`,
    })
    .where(eq(list.id, id));
}

export async function hardDeleteList(db: Database, id: string): Promise<void> {
  await db.delete(list).where(eq(list.id, id));
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
  language: string,
  opts: {
    userId?: string;
    limit?: number;
    offset?: number;
    watchStatuses?: CollectionWatchStatus[];
    hideCompleted?: boolean;
    hideDropped?: boolean;
    showHidden?: boolean;
  } & RecsFilters = {},
) {
  const {
    userId,
    limit: lim = 50,
    offset: off = 0,
    sortBy,
    membersRatingMin,
    memberVoteCountMin,
    watchStatuses,
    hideCompleted,
    hideDropped,
    showHidden,
    ...filterOpts
  } = opts;

  const mi = mediaI18n(language);
  const recCols = recsFilterColumnsForMedia(mi);
  const mediaCols = getTableColumns(media);
  const mediaSelect = {
    ...mediaCols,
    title: mi.title,
    overview: mi.overview,
    posterPath: mi.posterPath,
    logoPath: mi.logoPath,
    tagline: mi.tagline,
  };

  const listRow = await findListById(db, listId);
  const isServerLibrary = listRow?.type === "server";

  // The members-vote aggregation scans `user_media_state` for every member of
  // the list — heavy for shared collections. Skip it when the caller doesn't
  // filter or sort by it; the vast majority of carousel reads don't.
  const needsMemberVotes =
    membersRatingMin !== undefined ||
    memberVoteCountMin !== undefined ||
    sortBy === "members_rating.desc" ||
    sortBy === "members_rating.asc";

  const memberVotesSubquery = needsMemberVotes
    ? await (async () => {
        const memberRows = await db
          .select({ userId: listMember.userId })
          .from(listMember)
          .where(eq(listMember.listId, listId));
        const memberUserIds = memberRows.map((m) => m.userId);
        if (listRow?.userId) memberUserIds.push(listRow.userId);

        return db
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
      })()
    : null;

  const conditions: SQL[] = [
    eq(listItem.listId, listId),
    isLiveListItem,
    ...buildRecsFilterConditions(filterOpts, recCols),
  ];

  if (isServerLibrary && userId) {
    const accessibleMediaIds = db
      .select({ mediaId: userMediaLibrary.mediaId })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.userId, userId));

    conditions.push(sql`${listItem.mediaId} IN (${accessibleMediaIds})`);
  }

  if (memberVotesSubquery && membersRatingMin !== undefined) {
    conditions.push(sql`COALESCE(${memberVotesSubquery.avgRating}, 0) >= ${membersRatingMin}`);
  }
  if (memberVotesSubquery && memberVoteCountMin !== undefined) {
    conditions.push(sql`COALESCE(${memberVotesSubquery.voteCount}, 0) >= ${memberVoteCountMin}`);
  }

  const joinCurrentUserState = !!userId;
  if (userId) {
    const wsCondition = buildWatchStatusesCondition(watchStatuses);
    if (wsCondition) conditions.push(wsCondition);
    if (hideCompleted) {
      conditions.push(sql`${userMediaState.status} IS DISTINCT FROM 'completed'`);
    }
    if (hideDropped) {
      conditions.push(sql`${userMediaState.status} IS DISTINCT FROM 'dropped'`);
    }
    if (!showHidden) {
      conditions.push(sql`NOT EXISTS (
        SELECT 1 FROM ${userHiddenMedia}
        WHERE ${userHiddenMedia.userId} = ${userId}
        AND ${userHiddenMedia.externalId} = ${media.externalId}
        AND ${userHiddenMedia.provider} = ${media.provider}
      )`);
    }
  }

  // Stable tiebreaker — without it, ties in the primary sort key let offset
  // pagination pull the same row into two consecutive pages, producing
  // duplicate React keys on the client.
  const tiebreaker = desc(media.id);
  const orderByExpr = (() => {
    if (memberVotesSubquery && sortBy === "members_rating.desc") {
      return [sql`${memberVotesSubquery.avgRating} DESC NULLS LAST`, tiebreaker];
    }
    if (memberVotesSubquery && sortBy === "members_rating.asc") {
      return [sql`${memberVotesSubquery.avgRating} ASC NULLS LAST`, tiebreaker];
    }
    if (sortBy === "date_added.desc") return [desc(listItem.addedAt), tiebreaker];
    if (sortBy === "date_added.asc") return [asc(listItem.addedAt), tiebreaker];
    const customSort = recsSortOrder(sortBy, recCols);
    if (customSort) return [customSort, tiebreaker];
    return [asc(listItem.position), desc(listItem.addedAt), tiebreaker];
  })();

  const whereClause = and(...conditions);

  const userStateJoin = joinCurrentUserState
    ? and(eq(userMediaState.mediaId, media.id), eq(userMediaState.userId, userId))
    : null;

  // Four query shapes — picked to keep Drizzle's chained query builder happy
  // (the builder loses type info when joins are added through a mutable
  // variable). Each branch owns its full SELECT/JOIN chain end-to-end.
  // After the i18n drop, `media` is the table columns + the `mediaI18n`
  // overlaid title/overview/posterPath/logoPath/tagline so callers see the
  // pre-1C-δ shape.
  type MediaWithLocalization = typeof media.$inferSelect & {
    title: string;
    overview: string | null;
    posterPath: string | null;
    logoPath: string | null;
    tagline: string | null;
  };
  type ItemRow = {
    listItem: typeof listItem.$inferSelect;
    media: MediaWithLocalization;
    memberTotalRating?: number | null;
    memberVoteCount?: number | null;
    memberAvgRating?: number | null;
    userRating?: number | null;
    userStatus?: string | null;
  };

  const itemsP: Promise<ItemRow[]> = (async () => {
    if (memberVotesSubquery && userStateJoin) {
      return db
        .select({
          listItem,
          media: mediaSelect,
          memberTotalRating: memberVotesSubquery.totalRating,
          memberVoteCount: memberVotesSubquery.voteCount,
          memberAvgRating: memberVotesSubquery.avgRating,
          userRating: userMediaState.rating,
          userStatus: userMediaState.status,
        })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
        .leftJoin(userMediaState, userStateJoin)
        .where(whereClause)
        .orderBy(...orderByExpr)
        .limit(lim)
        .offset(off) as Promise<ItemRow[]>;
    }
    if (memberVotesSubquery) {
      return db
        .select({
          listItem,
          media: mediaSelect,
          memberTotalRating: memberVotesSubquery.totalRating,
          memberVoteCount: memberVotesSubquery.voteCount,
          memberAvgRating: memberVotesSubquery.avgRating,
        })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
        .where(whereClause)
        .orderBy(...orderByExpr)
        .limit(lim)
        .offset(off) as Promise<ItemRow[]>;
    }
    if (userStateJoin) {
      return db
        .select({
          listItem,
          media: mediaSelect,
          userRating: userMediaState.rating,
          userStatus: userMediaState.status,
        })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .leftJoin(userMediaState, userStateJoin)
        .where(whereClause)
        .orderBy(...orderByExpr)
        .limit(lim)
        .offset(off) as Promise<ItemRow[]>;
    }
    return db
      .select({ listItem, media: mediaSelect })
      .from(listItem)
      .innerJoin(media, eq(listItem.mediaId, media.id))
      .leftJoin(mi.locUser, mi.locUserJoin)
      .leftJoin(mi.locEn, mi.locEnJoin)
      .where(whereClause)
      .orderBy(...orderByExpr)
      .limit(lim)
      .offset(off) as Promise<ItemRow[]>;
  })();

  const countP: Promise<Array<{ total: number }>> = (async () => {
    if (memberVotesSubquery && userStateJoin) {
      return db
        .select({ total: count() })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
        .leftJoin(userMediaState, userStateJoin)
        .where(whereClause);
    }
    if (memberVotesSubquery) {
      return db
        .select({ total: count() })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .leftJoin(memberVotesSubquery, eq(memberVotesSubquery.mediaId, media.id))
        .where(whereClause);
    }
    if (userStateJoin) {
      return db
        .select({ total: count() })
        .from(listItem)
        .innerJoin(media, eq(listItem.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .leftJoin(userMediaState, userStateJoin)
        .where(whereClause);
    }
    return db
      .select({ total: count() })
      .from(listItem)
      .innerJoin(media, eq(listItem.mediaId, media.id))
      .leftJoin(mi.locUser, mi.locUserJoin)
      .leftJoin(mi.locEn, mi.locEnJoin)
      .where(whereClause);
  })();

  const [rows, [countRow]] = await Promise.all([itemsP, countP]);

  const membership = userId
    ? await getMembershipForMedia(
        db,
        userId,
        rows.map((r) => r.media.id),
        listId,
      )
    : new Map<string, MediaMembership>();

  const items = rows.map((row) => {
    const userRating =
      row.userRating !== null ? Number(row.userRating) : null;
    return {
      listItem: row.listItem,
      media: row.media,
      memberVotes:
        row.memberVoteCount !== null && Number(row.memberVoteCount) > 0
          ? {
              totalRating: Number(row.memberTotalRating ?? 0),
              voteCount: Number(row.memberVoteCount),
              avgRating: Number(row.memberAvgRating ?? 0),
            }
          : null,
      userRating: userRating,
      userStatus: row.userStatus ?? null,
      membership: membership.get(row.media.id) ?? {
        inWatchlist: false,
        otherCollections: [],
      },
    };
  });

  return { items, total: countRow?.total ?? 0 };
}

/** List items joined with media identifiers — used by Trakt list sync to
 *  reconcile membership against the remote. Includes both live rows
 *  (`deletedAt === null`) and tombstones; the consumer separates them. */
export async function findListItemsForSync(db: Database, listId: string) {
  return db
    .select({
      mediaId: listItem.mediaId,
      addedAt: listItem.addedAt,
      lastPushedAt: listItem.lastPushedAt,
      deletedAt: listItem.deletedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(listItem)
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(eq(listItem.listId, listId));
}

export async function addListItem(
  db: Database,
  data: typeof listItem.$inferInsert,
) {
  // Resurrect a tombstoned row (same listId+mediaId) instead of creating a new
  // one — it preserves the original `id`, `added_at`, and `notes`. This matters
  // for users who removed-then-readded as well as for sync flows that bounce.
  const [revived] = await db
    .update(listItem)
    .set({ deletedAt: null, deletedBy: null })
    .where(
      and(
        eq(listItem.listId, data.listId),
        eq(listItem.mediaId, data.mediaId),
        sql`${listItem.deletedAt} IS NOT NULL`,
      ),
    )
    .returning();
  if (revived) return revived;

  const [maxRow] = await db
    .select({ maxPos: max(listItem.position) })
    .from(listItem)
    .where(and(eq(listItem.listId, data.listId), isLiveListItem));
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

export type ListItemActor = "user" | "trakt-sync" | "move";

/**
 * Soft-delete a single live row. Hard delete is forbidden — every removal
 * must leave a tombstone so a buggy sync (or accidental click) can be undone
 * via `restoreListItems`. Targets only `deleted_at IS NULL` so re-running the
 * same call on an already-tombstoned row is a no-op.
 */
export async function removeListItem(
  db: Database,
  listId: string,
  mediaId: string,
  actor: ListItemActor = "user",
) {
  await db
    .update(listItem)
    .set({ deletedAt: new Date(), deletedBy: actor })
    .where(
      and(
        eq(listItem.listId, listId),
        eq(listItem.mediaId, mediaId),
        isNull(listItem.deletedAt),
      ),
    );
}

export async function removeListItems(
  db: Database,
  listId: string,
  mediaIds: string[],
  actor: ListItemActor = "user",
): Promise<void> {
  if (mediaIds.length === 0) return;
  await db
    .update(listItem)
    .set({ deletedAt: new Date(), deletedBy: actor })
    .where(
      and(
        eq(listItem.listId, listId),
        inArray(listItem.mediaId, mediaIds),
        isNull(listItem.deletedAt),
      ),
    );
}

/**
 * Restore tombstoned rows. Used by the user-facing undo + admin recovery.
 * Returns the number of rows un-tombstoned. Skips rows that would collide
 * with a live row in the same list (a re-add happened in the meantime).
 *
 * Only the most recent tombstone per (list, media) is revived — multiple
 * tombstones can exist when the user removed/re-added/removed in sequence,
 * and untombstoning all of them would violate the partial unique index.
 */
export async function restoreListItems(
  db: Database,
  listId: string,
  mediaIds: string[],
): Promise<number> {
  if (mediaIds.length === 0) return 0;
  const restored = await db.execute<{ id: string }>(sql`
    WITH candidates AS (
      SELECT DISTINCT ON (li.list_id, li.media_id) li.id
      FROM ${listItem} li
      WHERE li.list_id = ${listId}
        AND li.media_id IN (${sql.join(mediaIds.map((id) => sql`${id}::uuid`), sql`, `)})
        AND li.deleted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${listItem} live
          WHERE live.list_id = li.list_id
            AND live.media_id = li.media_id
            AND live.deleted_at IS NULL
        )
      ORDER BY li.list_id, li.media_id, li.deleted_at DESC
    )
    UPDATE ${listItem} target
    SET deleted_at = NULL, deleted_by = NULL
    FROM candidates
    WHERE target.id = candidates.id
    RETURNING target.id
  `);
  return restored.length;
}

/**
 * Move items between lists by *re-pointing* the FK in a single UPDATE.
 *
 * The previous INSERT-into-target + DELETE-from-source path produced two
 * problems: (1) the target row got a fresh `added_at = NOW()` so the row's
 * history was lost, and (2) `onConflictDoNothing` kept the *target's* old
 * row when the item already lived there, so the stale `added_at` could fall
 * outside the sync's conflict window and the row would be silently deleted
 * on the next pull.
 *
 * UPDATE-based move preserves `id`, `added_at`, `notes`, and `last_pushed_at`
 * for the rows that have a clean target. The remaining source rows (those
 * that collide with a live target row) are tombstoned with `deleted_by='move'`
 * so the move still completes from the user's perspective.
 */
export async function moveListItems(
  db: Database,
  fromListId: string,
  toListId: string,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) return;

  await db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxPos: max(listItem.position) })
      .from(listItem)
      .where(
        and(eq(listItem.listId, toListId), isNull(listItem.deletedAt)),
      );
    const nextPos = (maxRow?.maxPos ?? -1) + 1;

    // Re-point live source rows whose media has no live target row.
    // We assign sequential positions from `nextPos` to keep the new
    // arrivals appended to the target's tail in a deterministic order.
    await tx.execute(sql`
      WITH movable AS (
        SELECT id,
               row_number() OVER (ORDER BY position, added_at) - 1 AS offset
        FROM ${listItem}
        WHERE list_id = ${fromListId}
          AND media_id IN (${sql.join(
            mediaIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          AND deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${listItem} live
            WHERE live.list_id = ${toListId}
              AND live.media_id = ${listItem}.media_id
              AND live.deleted_at IS NULL
          )
      )
      UPDATE ${listItem} li
      SET list_id = ${toListId},
          position = ${nextPos} + movable.offset
      FROM movable
      WHERE li.id = movable.id
    `);

    // The remainder either collide with a live target row (target wins —
    // tombstone source so the user-visible "move" succeeds) or were already
    // tombstoned (nothing to do).
    await tx
      .update(listItem)
      .set({ deletedAt: new Date(), deletedBy: "move" })
      .where(
        and(
          eq(listItem.listId, fromListId),
          inArray(listItem.mediaId, mediaIds),
          isNull(listItem.deletedAt),
        ),
      );
  });
}

/** Mark `last_pushed_at` after a successful Trakt push. Reconciliation uses
 *  this as the positive signal that a row has been mirrored to the remote. */
export async function markListItemsPushed(
  db: Database,
  listId: string,
  mediaIds: string[],
  pushedAt: Date,
): Promise<void> {
  if (mediaIds.length === 0) return;
  await db
    .update(listItem)
    .set({ lastPushedAt: pushedAt })
    .where(
      and(
        eq(listItem.listId, listId),
        inArray(listItem.mediaId, mediaIds),
        isNull(listItem.deletedAt),
      ),
    );
}

export interface MediaMembership {
  inWatchlist: boolean;
  otherCollections: Array<{ id: string; name: string; slug: string }>;
}

/**
 * For a set of mediaIds, compute each media's membership across the current
 * user's own lists. Used to display "also in watchlist" + "in N other
 * collections" hints on collection detail views. Server library is ignored
 * (admin/shared concept); watchlist is surfaced separately.
 */
export async function getMembershipForMedia(
  db: Database,
  userId: string,
  mediaIds: string[],
  excludeListId?: string,
): Promise<Map<string, MediaMembership>> {
  const result = new Map<string, MediaMembership>();
  if (mediaIds.length === 0) return result;

  const rows = await db
    .select({
      mediaId: listItem.mediaId,
      listId: list.id,
      listName: list.name,
      listSlug: list.slug,
      listType: list.type,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .where(
      and(
        inArray(listItem.mediaId, mediaIds),
        eq(list.userId, userId),
        isNull(list.deletedAt),
        isLiveListItem,
      ),
    );

  for (const row of rows) {
    const prev = result.get(row.mediaId) ?? {
      inWatchlist: false,
      otherCollections: [],
    };
    if (row.listType === "watchlist") {
      prev.inWatchlist = true;
    } else if (row.listType === "custom" && row.listId !== excludeListId) {
      prev.otherCollections.push({
        id: row.listId,
        name: row.listName,
        slug: row.listSlug,
      });
    }
    result.set(row.mediaId, prev);
  }

  return result;
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
        isNull(list.deletedAt),
        isLiveListItem,
        or(eq(list.userId, userId), eq(list.type, "server")),
      ),
    );
  return items;
}

/**
 * Aggregate across the user's visible custom collections: returns distinct
 * media items with filters/sort/pagination. Server + watchlist lists are
 * excluded — this powers the "all items" browse view for user collections.
 */
export async function findUserCustomCollectionItems(
  db: Database,
  userId: string,
  language: string,
  hiddenListIds: string[],
  opts: {
    limit?: number;
    offset?: number;
    watchStatuses?: CollectionWatchStatus[];
    hideCompleted?: boolean;
    hideDropped?: boolean;
    showHidden?: boolean;
  } & RecsFilters = {},
) {
  const {
    limit: lim = 50,
    offset: off = 0,
    sortBy,
    watchStatuses,
    hideCompleted,
    hideDropped,
    showHidden,
    ...filterOpts
  } = opts;

  const mi = mediaI18n(language);
  const recCols = recsFilterColumnsForMedia(mi);
  const mediaCols = getTableColumns(media);
  const mediaSelect = {
    ...mediaCols,
    title: mi.title,
    overview: mi.overview,
    posterPath: mi.posterPath,
    logoPath: mi.logoPath,
    tagline: mi.tagline,
  };

  const userLists = await db
    .select({ id: list.id })
    .from(list)
    .where(
      and(
        eq(list.userId, userId),
        eq(list.type, "custom"),
        isNull(list.deletedAt),
      ),
    );
  const hiddenSet = new Set(hiddenListIds);
  const scopedListIds = userLists
    .map((l) => l.id)
    .filter((id) => !hiddenSet.has(id));

  if (scopedListIds.length === 0) return { items: [], total: 0 };

  const mediaIdRows = await db
    .selectDistinct({ mediaId: listItem.mediaId })
    .from(listItem)
    .where(and(inArray(listItem.listId, scopedListIds), isLiveListItem));
  const mediaIds = mediaIdRows.map((r) => r.mediaId);

  if (mediaIds.length === 0) return { items: [], total: 0 };

  const conditions: SQL[] = [
    inArray(media.id, mediaIds),
    ...buildRecsFilterConditions(filterOpts, recCols),
  ];

  const wsCondition = buildWatchStatusesCondition(watchStatuses);
  if (wsCondition) conditions.push(wsCondition);
  if (hideCompleted) {
    conditions.push(sql`${userMediaState.status} IS DISTINCT FROM 'completed'`);
  }
  if (hideDropped) {
    conditions.push(sql`${userMediaState.status} IS DISTINCT FROM 'dropped'`);
  }
  if (!showHidden) {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${userHiddenMedia}
      WHERE ${userHiddenMedia.userId} = ${userId}
      AND ${userHiddenMedia.externalId} = ${media.externalId}
      AND ${userHiddenMedia.provider} = ${media.provider}
    )`);
  }

  const userStateJoin = and(
    eq(userMediaState.mediaId, media.id),
    eq(userMediaState.userId, userId),
  );

  const customSort = recsSortOrder(sortBy, recCols);
  const orderByExpr =
    sortBy === "date_added.desc" || sortBy === "date_added.asc"
      ? sql`${media.popularity} DESC NULLS LAST`
      : (customSort ?? sql`${media.popularity} DESC NULLS LAST`);

  const whereClause = and(...conditions);

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        media: mediaSelect,
        userRating: userMediaState.rating,
      })
      .from(media)
      .leftJoin(mi.locUser, mi.locUserJoin)
      .leftJoin(mi.locEn, mi.locEnJoin)
      .leftJoin(userMediaState, userStateJoin)
      .where(whereClause)
      .orderBy(orderByExpr)
      .limit(lim)
      .offset(off),
    db
      .select({ total: count() })
      .from(media)
      .leftJoin(mi.locUser, mi.locUserJoin)
      .leftJoin(mi.locEn, mi.locEnJoin)
      .leftJoin(userMediaState, userStateJoin)
      .where(whereClause),
  ]);

  const membership = await getMembershipForMedia(
    db,
    userId,
    rows.map((r) => r.media.id),
  );

  return {
    items: rows.map((row) => ({
      media: row.media,
      userRating: row.userRating !== null ? Number(row.userRating) : null,
      membership: membership.get(row.media.id) ?? {
        inWatchlist: false,
        otherCollections: [],
      },
    })),
    total: countRow?.total ?? 0,
  };
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
        isNull(list.deletedAt),
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
