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
import { refreshTraktAccessTokenIfNeeded } from "@canto/core/infra/trakt/trakt.adapter";
import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { TraktSection } from "@canto/core/domain/trakt/types/trakt-section";
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
  traktApi: TraktApiPort;
  trakt: TraktRepositoryPort;
  userConnection: UserConnectionRepositoryPort;
  userMedia: UserMediaRepositoryPort;
  lists: ListsRepositoryPort;
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort };
}

async function executeSection(
  ctx: SyncContext,
  deps: RunTraktSectionDeps,
  section: TraktSection,
  startAt: string | undefined,
): Promise<void> {
  switch (section) {
    case "watched-movies":
      await pullWatchedMovies(ctx, deps);
      return;
    case "watched-shows":
      await pullWatchedShows(ctx, deps);
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
      await syncWatchlist(ctx, deps);
      return;
    case "ratings":
      await syncRatings(ctx, deps);
      return;
    case "favorites":
      await syncFavorites(ctx, deps);
      return;
    case "lists":
      await syncCustomLists(ctx, deps);
      return;
    case "playback":
      await pullInProgress(ctx, deps);
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
    deps.userConnection.update(conn.id, patch).then(() => undefined),
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
