/* -------------------------------------------------------------------------- */
/*  runTraktSection — single-section worker handler                            */
/*                                                                            */
/*  Each `trakt-sync-section` job calls this with a (connectionId, section,   */
/*  remoteAtIso) triple. We:                                                   */
/*    1. Load the connection and refresh the access token if needed.           */
/*    2. Dispatch to the use-case for the section (pull and push as           */
/*       applicable).                                                          */
/*    3. On success, advance that section's watermark to `remoteAtIso`. We    */
/*       deliberately skip the watermark write on failure so the next         */
/*       coordinator run replays the section from the same starting point.    */
/* -------------------------------------------------------------------------- */

import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";
import { updateUserConnection } from "../../infra/media-servers/user-connection-repository";
import { refreshTraktAccessTokenIfNeeded } from "../../infra/trakt/trakt.adapter";
import {
  findTraktSyncStateByConnection,
  setTraktSectionWatermark,
  upsertTraktSyncState,
  type TraktSection,
} from "../../infra/trakt/trakt-sync-repository";
import type { SyncContext } from "./use-cases/shared";
import { syncWatchlist } from "./use-cases/sync-watchlist";
import { syncCustomLists } from "./use-cases/sync-custom-lists";
import { syncRatings } from "./use-cases/sync-ratings";
import { syncFavorites } from "./use-cases/sync-favorites";
import {
  linkPulledHistoryBackfill,
  pullHistory,
  pushHistory,
} from "./use-cases/sync-history";
import { pullInProgress } from "./use-cases/sync-in-progress";
import {
  pullWatchedMovies,
  pullWatchedShows,
} from "./use-cases/sync-watched";

async function executeSection(
  ctx: SyncContext,
  section: TraktSection,
  startAt: string | undefined,
): Promise<void> {
  switch (section) {
    case "watched-movies":
      await pullWatchedMovies(ctx);
      return;
    case "watched-shows":
      await pullWatchedShows(ctx);
      return;
    case "history":
      // Pull is incremental; push always runs (it scans local-only rows).
      // linkPulledHistoryBackfill stitches up sync rows for events created
      // locally before this connection existed.
      await pullHistory(ctx, startAt);
      await pushHistory(ctx);
      await linkPulledHistoryBackfill(ctx);
      return;
    case "watchlist":
      await syncWatchlist(ctx);
      return;
    case "ratings":
      await syncRatings(ctx);
      return;
    case "favorites":
      await syncFavorites(ctx);
      return;
    case "lists":
      await syncCustomLists(ctx);
      return;
    case "playback":
      await pullInProgress(ctx);
      return;
  }
}

export interface RunSectionInput {
  connectionId: string;
  section: TraktSection;
  remoteAtIso: string | null;
}

export async function runTraktSection(
  db: Database,
  input: RunSectionInput,
): Promise<void> {
  const conn = await db.query.userConnection.findFirst({
    where: and(
      eq(userConnection.id, input.connectionId),
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
    ),
  });
  if (!conn?.token || !conn.userId) return;

  const { accessToken } = await refreshTraktAccessTokenIfNeeded(conn, (patch) =>
    updateUserConnection(db, conn.id, patch).then(() => undefined),
  );

  // `initialSync` biases reconcile decisions toward "import remote" — used
  // only by list/watchlist/ratings/favorites flows.
  const state = await findTraktSyncStateByConnection(db, conn.id);
  const initialSync = !state?.lastActivityAt;
  const now = new Date();

  // For `history` we forward the previous watermark to Trakt's `start_at`
  // filter so each run only walks the delta. Other sections always pull a
  // full snapshot — they don't accept an incremental cursor.
  const startAt =
    input.section === "history" && state?.historyAt
      ? state.historyAt.toISOString()
      : undefined;

  const ctx: SyncContext = {
    db,
    userId: conn.userId,
    connectionId: conn.id,
    accessToken,
    profileId: conn.externalUserId ?? "me",
    initialSync,
    now,
  };

  await executeSection(ctx, input.section, startAt);

  // Advance watermarks only on success. The lastActivityAt write keeps the
  // legacy "first-run" detection working until we migrate all reconcile
  // flows off `initialSync`.
  await upsertTraktSyncState(db, conn.id, {
    lastActivityAt: now,
  });
  if (input.remoteAtIso) {
    await setTraktSectionWatermark(
      db,
      conn.id,
      input.section,
      new Date(input.remoteAtIso),
    );
  }
}
