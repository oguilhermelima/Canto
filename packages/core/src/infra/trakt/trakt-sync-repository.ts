import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  traktHistorySync,
  traktListLink,
  traktSyncState,
} from "@canto/db/schema";

export async function findTraktListLinksByConnection(
  db: Database,
  userConnectionId: string,
) {
  return db.query.traktListLink.findMany({
    where: eq(traktListLink.userConnectionId, userConnectionId),
  });
}

/** Find the Trakt list link for a given local list id, if any. */
export async function findTraktListLinkByLocalListId(
  db: Database,
  localListId: string,
) {
  return db.query.traktListLink.findFirst({
    where: eq(traktListLink.localListId, localListId),
  });
}

export async function upsertTraktListLink(
  db: Database,
  data: {
    userConnectionId: string;
    traktListId: number;
    traktListSlug: string;
    localListId: string;
    remoteUpdatedAt?: Date | null;
    lastSyncedAt?: Date;
  },
) {
  const now = new Date();
  const [row] = await db
    .insert(traktListLink)
    .values({
      userConnectionId: data.userConnectionId,
      traktListId: data.traktListId,
      traktListSlug: data.traktListSlug,
      localListId: data.localListId,
      remoteUpdatedAt: data.remoteUpdatedAt ?? null,
      lastSyncedAt: data.lastSyncedAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [traktListLink.userConnectionId, traktListLink.traktListId],
      set: {
        traktListSlug: data.traktListSlug,
        localListId: data.localListId,
        remoteUpdatedAt: data.remoteUpdatedAt ?? null,
        lastSyncedAt: data.lastSyncedAt ?? now,
        updatedAt: now,
      },
    })
    .returning();

  return row!;
}

export async function deleteTraktListLinksNotIn(
  db: Database,
  userConnectionId: string,
  traktListIds: number[],
): Promise<number> {
  if (traktListIds.length === 0) {
    const rows = await db
      .delete(traktListLink)
      .where(eq(traktListLink.userConnectionId, userConnectionId))
      .returning({ id: traktListLink.id });
    return rows.length;
  }

  const rows = await db
    .delete(traktListLink)
    .where(
      and(
        eq(traktListLink.userConnectionId, userConnectionId),
        notInArray(traktListLink.traktListId, traktListIds),
      ),
    )
    .returning({ id: traktListLink.id });
  return rows.length;
}

export async function findTraktSyncStateByConnection(
  db: Database,
  userConnectionId: string,
) {
  return db.query.traktSyncState.findFirst({
    where: eq(traktSyncState.userConnectionId, userConnectionId),
  });
}

export type TraktSection =
  | "watched-movies"
  | "watched-shows"
  | "history"
  | "watchlist"
  | "ratings"
  | "favorites"
  | "lists"
  | "playback";

/** Map a section identifier to its watermark column name on `traktSyncState`. */
const SECTION_TO_WATERMARK: Record<
  TraktSection,
  | "watchedMoviesAt"
  | "watchedShowsAt"
  | "historyAt"
  | "watchlistAt"
  | "ratingsAt"
  | "favoritesAt"
  | "listsAt"
  | "playbackAt"
> = {
  "watched-movies": "watchedMoviesAt",
  "watched-shows": "watchedShowsAt",
  history: "historyAt",
  watchlist: "watchlistAt",
  ratings: "ratingsAt",
  favorites: "favoritesAt",
  lists: "listsAt",
  playback: "playbackAt",
};

interface TraktSyncStatePatch {
  lastPulledAt?: Date | null;
  lastPushedAt?: Date | null;
  lastActivityAt?: Date | null;
  watchedMoviesAt?: Date | null;
  watchedShowsAt?: Date | null;
  historyAt?: Date | null;
  watchlistAt?: Date | null;
  ratingsAt?: Date | null;
  favoritesAt?: Date | null;
  listsAt?: Date | null;
  playbackAt?: Date | null;
}

export async function upsertTraktSyncState(
  db: Database,
  userConnectionId: string,
  patch: TraktSyncStatePatch,
) {
  const now = new Date();
  const setClause: Record<string, unknown> = { updatedAt: now };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) setClause[k] = v;
  }

  const [row] = await db
    .insert(traktSyncState)
    .values({
      userConnectionId,
      lastPulledAt: patch.lastPulledAt ?? null,
      lastPushedAt: patch.lastPushedAt ?? null,
      lastActivityAt: patch.lastActivityAt ?? now,
      watchedMoviesAt: patch.watchedMoviesAt ?? null,
      watchedShowsAt: patch.watchedShowsAt ?? null,
      historyAt: patch.historyAt ?? null,
      watchlistAt: patch.watchlistAt ?? null,
      ratingsAt: patch.ratingsAt ?? null,
      favoritesAt: patch.favoritesAt ?? null,
      listsAt: patch.listsAt ?? null,
      playbackAt: patch.playbackAt ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: traktSyncState.userConnectionId,
      set: setClause,
    })
    .returning();

  return row!;
}

/** Atomic update of a single section's watermark — called by the section
 *  worker after a successful pull. We deliberately skip the watermark write
 *  on failure so the next coordinator run replays the section from the same
 *  starting point. */
export async function setTraktSectionWatermark(
  db: Database,
  userConnectionId: string,
  section: TraktSection,
  remoteAt: Date,
): Promise<void> {
  const column = SECTION_TO_WATERMARK[section];
  await upsertTraktSyncState(db, userConnectionId, {
    [column]: remoteAt,
  } as TraktSyncStatePatch);
}

export async function findTraktHistorySyncByRemoteId(
  db: Database,
  userConnectionId: string,
  remoteHistoryId: number,
) {
  return db.query.traktHistorySync.findFirst({
    where: and(
      eq(traktHistorySync.userConnectionId, userConnectionId),
      eq(traktHistorySync.remoteHistoryId, remoteHistoryId),
    ),
  });
}

export async function findTraktHistorySyncByRemoteIds(
  db: Database,
  userConnectionId: string,
  remoteHistoryIds: number[],
) {
  if (remoteHistoryIds.length === 0) return [];
  return db.query.traktHistorySync.findMany({
    where: and(
      eq(traktHistorySync.userConnectionId, userConnectionId),
      inArray(traktHistorySync.remoteHistoryId, remoteHistoryIds),
    ),
  });
}

export async function findTraktHistorySyncByLocalId(
  db: Database,
  userConnectionId: string,
  localHistoryId: string,
) {
  return db.query.traktHistorySync.findFirst({
    where: and(
      eq(traktHistorySync.userConnectionId, userConnectionId),
      eq(traktHistorySync.localHistoryId, localHistoryId),
    ),
  });
}

export async function findTraktHistorySyncByLocalIds(
  db: Database,
  userConnectionId: string,
  localHistoryIds: string[],
) {
  if (localHistoryIds.length === 0) return [];
  return db.query.traktHistorySync.findMany({
    where: and(
      eq(traktHistorySync.userConnectionId, userConnectionId),
      inArray(traktHistorySync.localHistoryId, localHistoryIds),
    ),
  });
}

export async function createTraktHistorySync(
  db: Database,
  data: {
    userConnectionId: string;
    localHistoryId?: string | null;
    remoteHistoryId?: number | null;
    syncedDirection: "pull" | "push";
  },
) {
  const [row] = await db
    .insert(traktHistorySync)
    .values({
      userConnectionId: data.userConnectionId,
      localHistoryId: data.localHistoryId ?? null,
      remoteHistoryId: data.remoteHistoryId ?? null,
      syncedDirection: data.syncedDirection,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function attachRemoteIdToHistorySync(
  db: Database,
  userConnectionId: string,
  localHistoryId: string,
  remoteHistoryId: number,
): Promise<void> {
  await db
    .update(traktHistorySync)
    .set({ remoteHistoryId })
    .where(
      and(
        eq(traktHistorySync.userConnectionId, userConnectionId),
        eq(traktHistorySync.localHistoryId, localHistoryId),
        isNull(traktHistorySync.remoteHistoryId),
      ),
    );
}
