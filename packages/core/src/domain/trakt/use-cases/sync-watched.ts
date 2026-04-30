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

import { findEpisodeIdByMediaAndNumbers } from "@canto/core/infra/repositories";
import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import { promoteUserMediaStateFromPlayback } from "@canto/core/domain/user-media/use-cases/promote-user-media-state-from-playback";
import {
  parseDateOrNow,
  resolveMediaFromTraktRef,
  type ResolveMediaDeps,
  type SyncContext,
} from "@canto/core/domain/trakt/use-cases/shared";

export interface SyncWatchedDeps extends ResolveMediaDeps {
  traktApi: TraktApiPort;
  userMedia: UserMediaRepositoryPort;
}

/** Reverse-sync (Plex/Jellyfin) calls this after every per-item upsert; we
 *  do the same here so the library "Completed" tab — which reads
 *  `user_media_state.status`, not `user_playback_progress.is_completed` —
 *  picks up Trakt-watched items. Failures are swallowed: a botched promotion
 *  for one media must not block the rest of the pull. */
async function promoteSafely(
  ctx: SyncContext,
  deps: SyncWatchedDeps,
  mediaId: string,
): Promise<void> {
  try {
    await promoteUserMediaStateFromPlayback(
      ctx.db,
      { repo: deps.userMedia },
      {
        userId: ctx.userId,
        mediaId,
      },
    );
  } catch (err) {
    console.warn(
      `[trakt-sync] promote state failed for media ${mediaId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function pullWatchedMovies(
  ctx: SyncContext,
  deps: SyncWatchedDeps,
): Promise<void> {
  const remoteRows = await deps.traktApi.listWatchedMovies(ctx.accessToken);
  if (remoteRows.length === 0) return;

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
      deps,
      { type: "movie", ids: remote.ids },
      resolveCache,
    );
    if (!mediaId) continue;

    await deps.userMedia.upsertPlayback({
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
    await promoteSafely(ctx, deps, mediaId);
  }
}

export async function pullWatchedShows(
  ctx: SyncContext,
  deps: SyncWatchedDeps,
): Promise<void> {
  const remoteRows = await deps.traktApi.listWatchedShows(ctx.accessToken);
  if (remoteRows.length === 0) return;

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
      deps,
      { type: "show", ids: remote.ids },
      resolveCache,
    );
    if (!mediaId) continue;

    // Each watched episode becomes a per-episode playback row. We deliberately
    // do NOT also write a movie-level (episodeId=null) row — that representation
    // is reserved for movies. Show-level "watched" in Canto is a roll-up of
    // its episode rows and is computed on read.
    let touchedAny = false;
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

      await deps.userMedia.upsertPlayback({
        userId: ctx.userId,
        mediaId,
        episodeId,
        positionSeconds: 0,
        isCompleted: true,
        lastWatchedAt: parseDateOrNow(ep.lastWatchedAt, ctx.now),
        source: "trakt",
      });
      touchedAny = true;
    }

    // Promote once per show, not per episode — the rule reads the entire
    // playback set anyway, so per-episode promotions would do redundant work.
    if (touchedAny) await promoteSafely(ctx, deps, mediaId);
  }
}
