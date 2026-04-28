/* -------------------------------------------------------------------------- */
/*  pullWatched — bridges Trakt's "watched" surface into userPlaybackProgress  */
/*                                                                            */
/*  The historical Trakt sync only wrote append-only events to                 */
/*  `user_watch_history`. The Canto UI's "watched" flag, however, is driven   */
/*  by `user_playback_progress.is_completed` — the same column that Plex and  */
/*  Jellyfin reverse-sync populate. As a result, users with thousands of      */
/*  Trakt-watched items still saw zero "watched" markers in Canto.            */
/*                                                                            */
/*  /sync/watched/movies and /sync/watched/shows return the consolidated      */
/*  watched state (not events): one row per movie ever watched, and one row   */
/*  per show with a nested seasons/episodes tree of plays. We map that to     */
/*  per-(media, episode) playback rows with isCompleted=true.                  */
/* -------------------------------------------------------------------------- */

import { findEpisodeIdByMediaAndNumbers } from "../../../infra/repositories";
import { upsertUserPlaybackProgress } from "../../../infra/repositories";
import {
  listTraktWatchedMovies,
  listTraktWatchedShows,
} from "../../../infra/trakt/trakt.adapter";
import {
  parseDateOrNow,
  resolveMediaFromTraktRef,
  type SyncContext,
} from "./shared";

export async function pullWatchedMovies(ctx: SyncContext): Promise<void> {
  const remoteRows = await listTraktWatchedMovies(ctx.accessToken);
  if (remoteRows.length === 0) return;

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
      { type: "movie", ids: remote.ids },
      resolveCache,
    );
    if (!mediaId) continue;

    await upsertUserPlaybackProgress(ctx.db, {
      userId: ctx.userId,
      mediaId,
      episodeId: null,
      // Trakt's /sync/watched only contains items the user has finished at
      // least once (plays >= 1). For movies that's a clean 100%-complete
      // signal; we don't model partial movie progress here — that's what
      // /sync/playback (sync-in-progress) is for.
      positionSeconds: 0,
      isCompleted: true,
      lastWatchedAt: parseDateOrNow(remote.lastWatchedAt, ctx.now),
      source: "trakt",
    });
  }
}

export async function pullWatchedShows(ctx: SyncContext): Promise<void> {
  const remoteRows = await listTraktWatchedShows(ctx.accessToken);
  if (remoteRows.length === 0) return;

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
      { type: "show", ids: remote.ids },
      resolveCache,
    );
    if (!mediaId) continue;

    // Each watched episode becomes a per-episode playback row. We deliberately
    // do NOT also write a movie-level (episodeId=null) row — that representation
    // is reserved for movies. Show-level "watched" in Canto is a roll-up of
    // its episode rows and is computed on read.
    for (const ep of remote.episodes) {
      const episodeId = await findEpisodeIdByMediaAndNumbers(
        ctx.db,
        mediaId,
        ep.seasonNumber,
        ep.episodeNumber,
      );
      // Specials (S0) and numbering mismatches between Trakt and TMDB can
      // leave us without a local episode row. Skip silently rather than
      // fabricate a roll-up — the user can always re-mark watched manually
      // and the next sync will pick up new episodes once persisted.
      if (!episodeId) continue;

      await upsertUserPlaybackProgress(ctx.db, {
        userId: ctx.userId,
        mediaId,
        episodeId,
        positionSeconds: 0,
        isCompleted: true,
        lastWatchedAt: parseDateOrNow(ep.lastWatchedAt, ctx.now),
        source: "trakt",
      });
    }
  }
}
