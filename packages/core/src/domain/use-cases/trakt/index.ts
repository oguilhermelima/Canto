import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";
import {
  findTraktSyncStateByConnection,
  upsertTraktSyncState,
} from "../../../infra/trakt/trakt-sync-repository";
import { updateUserConnection } from "../../../infra/media-servers/user-connection-repository";
import { refreshTraktAccessTokenIfNeeded } from "../../../infra/trakt/trakt.adapter";
import type { SyncContext } from "./shared";
import { syncWatchlist } from "./sync-watchlist";
import { syncCustomLists } from "./sync-custom-lists";
import { syncRatings } from "./sync-ratings";
import { syncFavorites } from "./sync-favorites";
import {
  linkPulledHistoryBackfill,
  pullHistory,
  pushHistory,
} from "./sync-history";
import { pullInProgress } from "./sync-in-progress";

export async function syncTraktConnection(
  db: Database,
  connectionId: string,
): Promise<void> {
  const conn = await db.query.userConnection.findFirst({
    where: and(
      eq(userConnection.id, connectionId),
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
    ),
  });
  if (!conn?.token || !conn.userId) return;

  const { accessToken } = await refreshTraktAccessTokenIfNeeded(conn, (patch) =>
    updateUserConnection(db, conn.id, patch).then(() => undefined),
  );
  const syncState = await findTraktSyncStateByConnection(db, conn.id);
  const initialSync = !syncState?.lastActivityAt;
  const now = new Date();
  const profileId = conn.externalUserId ?? "me";

  const ctx: SyncContext = {
    db,
    userId: conn.userId,
    connectionId: conn.id,
    accessToken,
    profileId,
    initialSync,
    now,
  };

  await syncWatchlist(ctx);
  await syncCustomLists(ctx);
  await syncRatings(ctx);
  await syncFavorites(ctx);
  await pullHistory(ctx);
  await pushHistory(ctx);
  await linkPulledHistoryBackfill(ctx);
  await pullInProgress(ctx);

  await upsertTraktSyncState(db, conn.id, {
    lastPulledAt: now,
    lastPushedAt: now,
    lastActivityAt: now,
  });
}

export async function syncAllTraktConnections(db: Database): Promise<void> {
  const connections = await db.query.userConnection.findMany({
    where: and(
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
      isNotNull(userConnection.token),
    ),
  });

  for (const connection of connections) {
    try {
      await syncTraktConnection(db, connection.id);
    } catch (err) {
      console.error(
        `[trakt-sync] Connection ${connection.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function syncUserTraktConnections(
  db: Database,
  userId: string,
): Promise<void> {
  const connections = await db.query.userConnection.findMany({
    where: and(
      eq(userConnection.userId, userId),
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
      isNotNull(userConnection.token),
    ),
  });

  for (const connection of connections) {
    try {
      await syncTraktConnection(db, connection.id);
    } catch (err) {
      console.error(
        `[trakt-sync] User ${userId} connection ${connection.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
