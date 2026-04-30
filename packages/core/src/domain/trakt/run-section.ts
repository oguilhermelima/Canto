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
import { updateUserConnection } from "@canto/core/infra/media-servers/user-connection-repository";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import type { TraktSection } from "@canto/core/domain/trakt/types/trakt-section";
import { refreshTraktAccessTokenIfNeeded } from "@canto/core/infra/trakt/trakt.adapter";
import type { SyncContext } from "@canto/core/domain/trakt/use-cases/shared";
import { syncWatchlist } from "@canto/core/domain/trakt/use-cases/sync-watchlist";
import { syncCustomLists } from "@canto/core/domain/trakt/use-cases/sync-custom-lists";
import { syncRatings } from "@canto/core/domain/trakt/use-cases/sync-ratings";
import { syncFavorites } from "@canto/core/domain/trakt/use-cases/sync-favorites";
import {
  linkPulledHistoryBackfill,
  pullHistory,
  pushHistory,
} from "@canto/core/domain/trakt/use-cases/sync-history";
import { pullInProgress } from "@canto/core/domain/trakt/use-cases/sync-in-progress";
import {
  pullWatchedMovies,
  pullWatchedShows,
} from "@canto/core/domain/trakt/use-cases/sync-watched";

export interface RunTraktSectionDeps {
  trakt: TraktRepositoryPort;
}

async function executeSection(
  ctx: SyncContext,
  deps: RunTraktSectionDeps,
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
      await pullHistory(ctx, deps, startAt);
      await pushHistory(ctx, deps);
      await linkPulledHistoryBackfill(ctx, deps);
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
      await syncCustomLists(ctx, deps);
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
  deps: RunTraktSectionDeps,
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
  const state = await deps.trakt.findSyncStateByConnection(conn.id);
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

  await executeSection(ctx, deps, input.section, startAt);

  // Advance watermarks only on success. The lastActivityAt write keeps the
  // legacy "first-run" detection working until we migrate all reconcile
  // flows off `initialSync`.
  await deps.trakt.upsertSyncState(conn.id, {
    lastActivityAt: now,
  });
  if (input.remoteAtIso) {
    await deps.trakt.setSectionWatermark(
      conn.id,
      input.section,
      new Date(input.remoteAtIso),
    );
  }
}
