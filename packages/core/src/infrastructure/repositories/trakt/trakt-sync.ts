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

export async function upsertTraktSyncState(
  db: Database,
  userConnectionId: string,
  patch: {
    lastPulledAt?: Date | null;
    lastPushedAt?: Date | null;
    lastActivityAt?: Date | null;
  },
) {
  const now = new Date();
  const [row] = await db
    .insert(traktSyncState)
    .values({
      userConnectionId,
      lastPulledAt: patch.lastPulledAt ?? null,
      lastPushedAt: patch.lastPushedAt ?? null,
      lastActivityAt: patch.lastActivityAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: traktSyncState.userConnectionId,
      set: {
        ...(patch.lastPulledAt !== undefined
          ? { lastPulledAt: patch.lastPulledAt }
          : {}),
        ...(patch.lastPushedAt !== undefined
          ? { lastPushedAt: patch.lastPushedAt }
          : {}),
        ...(patch.lastActivityAt !== undefined
          ? { lastActivityAt: patch.lastActivityAt }
          : {}),
        updatedAt: now,
      },
    })
    .returning();

  return row!;
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
