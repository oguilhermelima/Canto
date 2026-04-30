/* -------------------------------------------------------------------------- */
/*  Trakt sync coordinator                                                     */
/*                                                                            */
/*  Replaces the old "syncTraktConnection runs eight pulls in series" model.  */
/*                                                                            */
/*  Per cron tick (every 10 min) we now:                                       */
/*    1. List enabled Trakt connections.                                       */
/*    2. For each connection, refresh the access token if needed and call      */
/*       /sync/last_activities (one cheap HTTP call). Trakt returns a          */
/*       per-section "last updated" timestamp.                                  */
/*    3. Compare each section's remote timestamp against the local watermark   */
/*       in `trakt_sync_state`. Sections whose remote hasn't moved are         */
/*       skipped entirely — no work, no Trakt calls, nothing.                  */
/*    4. For sections that did move (and for push-bearing sections always),   */
/*       dispatch a `trakt-sync-section` job with the section identifier and   */
/*       the remote timestamp. Each section runs in its own BullMQ job: a     */
/*       single failure no longer blocks any other section, and BullMQ's      */
/*       retry/backoff applies per surface.                                    */
/*                                                                            */
/*  `force=true` is used for user-triggered re-syncs and the initial bootstrap*/
/*  after connecting an account — it dispatches every section regardless of   */
/*  watermarks so a brand-new connection (no watermarks) and an existing     */
/*  connection (stale watermarks) backfill identically.                        */
/* -------------------------------------------------------------------------- */

import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";
import { updateUserConnection } from "@canto/core/infra/media-servers/user-connection-repository";
import {
  getTraktLastActivities,
  refreshTraktAccessTokenIfNeeded,
  type TraktLastActivities,
} from "@canto/core/infra/trakt/trakt.adapter";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import type { TraktSection } from "@canto/core/domain/trakt/types/trakt-section";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";

/* Sections that pull AND push. We always dispatch these so locally-pending
 * pushes don't sit forever waiting for a remote-side change. The section
 * runner short-circuits the pull if there's nothing new to fetch. */
const PUSH_BEARING_SECTIONS: ReadonlySet<TraktSection> = new Set([
  "history",
  "watchlist",
  "ratings",
  "favorites",
  "lists",
]);

/* Sections that are pull-only — only worth dispatching when the remote moved. */
const PULL_ONLY_SECTIONS: ReadonlySet<TraktSection> = new Set([
  "watched-movies",
  "watched-shows",
  "playback",
]);

const ALL_SECTIONS: TraktSection[] = [
  "watched-movies",
  "watched-shows",
  "history",
  "watchlist",
  "ratings",
  "favorites",
  "lists",
  "playback",
];

interface TraktWatermarks {
  watchedMoviesAt: Date | null;
  watchedShowsAt: Date | null;
  historyAt: Date | null;
  watchlistAt: Date | null;
  ratingsAt: Date | null;
  favoritesAt: Date | null;
  listsAt: Date | null;
  playbackAt: Date | null;
}

function remoteForSection(
  section: TraktSection,
  remote: TraktLastActivities,
): string | null {
  switch (section) {
    case "watched-movies":
      return remote.moviesWatchedAt;
    case "watched-shows":
      return remote.episodesWatchedAt;
    case "history":
      return remote.historyAt;
    case "watchlist":
      return remote.watchlistAt;
    case "ratings":
      return remote.ratingsAt;
    case "favorites":
      return remote.favoritesAt;
    case "lists":
      return remote.listsAt;
    case "playback":
      return remote.playbackAt;
  }
}

function localForSection(
  section: TraktSection,
  watermarks: TraktWatermarks,
): Date | null {
  switch (section) {
    case "watched-movies":
      return watermarks.watchedMoviesAt;
    case "watched-shows":
      return watermarks.watchedShowsAt;
    case "history":
      return watermarks.historyAt;
    case "watchlist":
      return watermarks.watchlistAt;
    case "ratings":
      return watermarks.ratingsAt;
    case "favorites":
      return watermarks.favoritesAt;
    case "lists":
      return watermarks.listsAt;
    case "playback":
      return watermarks.playbackAt;
  }
}

function shouldDispatch(
  section: TraktSection,
  remote: TraktLastActivities,
  watermarks: TraktWatermarks,
  force: boolean,
): boolean {
  if (force) return true;

  // Push-bearing sections always run so locally-queued pushes get drained
  // even when the remote hasn't moved. The section runner is responsible
  // for cheaply detecting "nothing to push" and bailing.
  if (PUSH_BEARING_SECTIONS.has(section)) return true;

  if (PULL_ONLY_SECTIONS.has(section)) {
    const remoteIso = remoteForSection(section, remote);
    const localTs = localForSection(section, watermarks);
    if (!remoteIso) return false;
    if (!localTs) return true; // never synced — go pull
    return new Date(remoteIso).getTime() > localTs.getTime();
  }

  return false;
}

export interface CoordinateResult {
  connections: number;
  dispatched: number;
  skipped: number;
}

interface CoordinateOptions {
  /** Limit the run to a single connection (used by user-triggered sync). */
  connectionId?: string;
  /** Bypass watermark comparison and dispatch every section. Used by initial
   *  bootstrap after connecting an account and by manual "resync" triggers. */
  force?: boolean;
}

export interface CoordinateTraktSyncDeps {
  trakt: TraktRepositoryPort;
}

export async function coordinateTraktSync(
  db: Database,
  deps: CoordinateTraktSyncDeps,
  dispatcher: JobDispatcherPort,
  options: CoordinateOptions = {},
): Promise<CoordinateResult> {
  const conditions = [
    eq(userConnection.provider, "trakt"),
    eq(userConnection.enabled, true),
    isNotNull(userConnection.token),
  ];
  if (options.connectionId) {
    conditions.push(eq(userConnection.id, options.connectionId));
  }

  const connections = await db.query.userConnection.findMany({
    where: and(...conditions),
  });

  let dispatched = 0;
  let skipped = 0;

  // Connections are independent — Promise.allSettled prevents one bad token
  // from blocking the others. A failure here is logged but doesn't propagate.
  const tasks = connections.map(async (conn) => {
    if (!conn.token || !conn.userId) {
      skipped += ALL_SECTIONS.length;
      return;
    }

    let activities: TraktLastActivities;
    try {
      const { accessToken } = await refreshTraktAccessTokenIfNeeded(
        conn,
        (patch) => updateUserConnection(db, conn.id, patch).then(() => undefined),
      );
      activities = await getTraktLastActivities(accessToken);
    } catch (err) {
      console.warn(
        `[trakt-sync] coordinator: probe failed for connection ${conn.id}:`,
        err instanceof Error ? err.message : err,
      );
      skipped += ALL_SECTIONS.length;
      return;
    }

    const state = await deps.trakt.findSyncStateByConnection(conn.id);
    const watermarks: TraktWatermarks = {
      watchedMoviesAt: state?.watchedMoviesAt ?? null,
      watchedShowsAt: state?.watchedShowsAt ?? null,
      historyAt: state?.historyAt ?? null,
      watchlistAt: state?.watchlistAt ?? null,
      ratingsAt: state?.ratingsAt ?? null,
      favoritesAt: state?.favoritesAt ?? null,
      listsAt: state?.listsAt ?? null,
      playbackAt: state?.playbackAt ?? null,
    };

    for (const section of ALL_SECTIONS) {
      if (!shouldDispatch(section, activities, watermarks, !!options.force)) {
        skipped += 1;
        continue;
      }
      const remoteAtIso = remoteForSection(section, activities);
      try {
        await dispatcher.traktSyncSection(conn.id, section, remoteAtIso);
        dispatched += 1;
      } catch (err) {
        console.warn(
          `[trakt-sync] coordinator: dispatch failed for ${conn.id}/${section}:`,
          err instanceof Error ? err.message : err,
        );
        skipped += 1;
      }
    }
  });

  await Promise.allSettled(tasks);

  return { connections: connections.length, dispatched, skipped };
}
