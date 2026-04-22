import { db } from "@canto/db/client";
import { sql } from "drizzle-orm";
import {
  findListByIdIncludingDeleted,
  findTombstonedTraktLists,
  hardDeleteList,
} from "@canto/core/infra/lists/list-repository";
import { findTraktListLinkByLocalListId } from "@canto/core/infra/trakt/trakt-sync-repository";
import { findUserConnectionById, updateUserConnection } from "@canto/core/infra/media-servers/user-connection-repository";
import {
  deleteTraktList,
  refreshTraktAccessTokenIfNeeded,
  TraktHttpError,
} from "@canto/core/infra/trakt/trakt.adapter";
import { dispatchTraktListDelete } from "@canto/core/platform/queue/bullmq-dispatcher";

const SWEEP_GRACE_MS = 60_000;

/**
 * Process a single Trakt list deletion. Runs from the per-job dispatch when
 * the user deletes a list in the UI. Throws on failure so BullMQ retries —
 * tombstone stays so the sweeper can re-dispatch later.
 */
export async function handleTraktListDelete(localListId: string): Promise<void> {
  const list = await findListByIdIncludingDeleted(db, localListId);
  if (!list) {
    // Already hard-deleted (concurrent run won the race) — nothing to do.
    return;
  }
  if (!list.deletedAt) {
    // Defensive: if not tombstoned, we shouldn't be here. Skip.
    console.warn(`[trakt-list-delete] list ${localListId} not tombstoned, skipping`);
    return;
  }

  const link = await findTraktListLinkByLocalListId(db, localListId);
  if (!link) {
    // No remote mirror — safe to hard-delete locally.
    await hardDeleteList(db, localListId);
    return;
  }

  const conn = await findUserConnectionById(db, link.userConnectionId);
  if (!conn || !conn.token || !conn.userId) {
    // Connection vanished — drop the local row; remote becomes orphaned but
    // there is no way to act on it without credentials. Better than blocking.
    await hardDeleteList(db, localListId);
    return;
  }

  const { accessToken } = await refreshTraktAccessTokenIfNeeded(conn, (patch) =>
    updateUserConnection(db, conn.id, patch).then(() => undefined),
  );

  try {
    await deleteTraktList(accessToken, link.traktListId);
  } catch (err) {
    // 404 means Trakt no longer has the list — treat as success.
    if (err instanceof TraktHttpError && err.status === 404) {
      // fall through to hard delete
    } else {
      throw err;
    }
  }

  await hardDeleteList(db, localListId);
}

/**
 * Sweeper — re-dispatches deletion jobs for any tombstoned lists that have
 * been awaiting processing for longer than the grace window. Catches lists
 * orphaned by an exhausted retry chain or a worker restart mid-flight.
 */
export async function handleTraktListDeleteSweep(): Promise<void> {
  const cutoff = Date.now() - SWEEP_GRACE_MS;
  const rows = await findTombstonedTraktLists(db);
  let dispatched = 0;
  for (const row of rows) {
    if (!row.deletedAt) continue;
    if (row.deletedAt.getTime() > cutoff) continue;
    if (await dispatchTraktListDelete(row.id)) dispatched += 1;
  }
  if (dispatched > 0) {
    console.log(`[trakt-list-delete] sweeper re-dispatched ${dispatched} tombstones`);
  }
  // touch sql to keep the import — drizzle's tree-shaker can otherwise drop
  // it from the worker bundle when no other queries land in this file.
  void sql;
}
