import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type {
  TraktIds,
  TraktMediaRef,
} from "@canto/core/domain/trakt/types/trakt-api";
import {
  decidePresenceAction,
  dedupeByKey,
  mediaIdsFromRow,
  mediaRefKey,
  parseDateOrNow,
  resolveMediaFromTraktRef,
  toTraktFavoritesBody,
  toTraktRatingsBody,
  withinConflictWindow
  
  
  
} from "@canto/core/domain/trakt/use-cases/shared";
import type {LocalRatingRef, ResolveMediaDeps, SyncContext} from "@canto/core/domain/trakt/use-cases/shared";

export interface SyncRatingsDeps extends ResolveMediaDeps {
  traktApi: TraktApiPort;
  userMedia: UserMediaRepositoryPort;
}

export async function syncRatings(
  ctx: SyncContext,
  deps: SyncRatingsDeps,
): Promise<void> {
  const localRows = await deps.userMedia.findOverrideRatingsForSync(ctx.userId);

  const remoteRows = await deps.traktApi.listRatings(
    ctx.accessToken,
    ctx.profileId,
  );

  const localByKey = new Map<string, LocalRatingRef>();
  for (const local of localRows) {
    const mapped: LocalRatingRef = {
      mediaId: local.mediaId,
      type: local.type === "show" ? "show" : "movie",
      ids: mediaIdsFromRow(local),
      occurredAt: local.updatedAt,
      rating: local.rating,
    };
    const key = mediaRefKey(mapped.type, mapped.ids);
    if (!key) continue;
    localByKey.set(key, mapped);
  }

  const remoteByKey = new Map<string, TraktMediaRef>();
  for (const remote of remoteRows) {
    const key = mediaRefKey(remote.type, remote.ids);
    if (!key) continue;
    remoteByKey.set(key, remote);
  }

  const keys = new Set<string>([...localByKey.keys(), ...remoteByKey.keys()]);

  const addRemote: Array<{
    type: "movie" | "show";
    ids: TraktIds;
    rating: number;
  }> = [];
  const removeRemote: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const resolveCache = new Map<string, string | null>();

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);

    if (local && remote) {
      if (local.rating === remote.rating) continue;

      const remoteAt = parseDateOrNow(remote.ratedAt, ctx.now);
      const useLocal = withinConflictWindow(local.occurredAt, remoteAt)
        ? local.occurredAt <= remoteAt
        : local.occurredAt > remoteAt;

      if (useLocal) {
        addRemote.push({
          type: local.type,
          ids: local.ids,
          rating: local.rating,
        });
      } else if (typeof remote.rating === "number") {
        const ratedAt = parseDateOrNow(remote.ratedAt, ctx.now);
        await deps.userMedia.upsertRating({
          userId: ctx.userId,
          mediaId: local.mediaId,
          seasonId: null,
          episodeId: null,
          rating: remote.rating,
          isOverride: true,
          ratedAt,
        });
        await deps.userMedia.upsertState({
          userId: ctx.userId,
          mediaId: local.mediaId,
          rating: remote.rating,
          updatedAt: ratedAt,
        });
      }
      continue;
    }

    if (local && !remote) {
      const keepPresence = decidePresenceAction(
        local.occurredAt,
        ctx.now,
        ctx.initialSync,
      );
      if (keepPresence === "keep-presence") {
        addRemote.push({
          type: local.type,
          ids: local.ids,
          rating: local.rating,
        });
      } else {
        await deps.userMedia.deleteRating(ctx.userId, local.mediaId, null, null);
        await deps.userMedia.upsertState({
          userId: ctx.userId,
          mediaId: local.mediaId,
          rating: null,
        });
      }
      continue;
    }

    if (!local && remote && typeof remote.rating === "number") {
      const remoteAt = parseDateOrNow(remote.ratedAt, ctx.now);
      const keepPresence = decidePresenceAction(
        remoteAt,
        ctx.now,
        ctx.initialSync,
      );
      const mediaId = await resolveMediaFromTraktRef(
        ctx.db,
        deps,
        remote,
        resolveCache,
      );
      if (!mediaId) continue;

      if (keepPresence === "keep-presence") {
        await deps.userMedia.upsertRating({
          userId: ctx.userId,
          mediaId,
          seasonId: null,
          episodeId: null,
          rating: remote.rating,
          isOverride: true,
          ratedAt: remoteAt,
        });
        await deps.userMedia.upsertState({
          userId: ctx.userId,
          mediaId,
          rating: remote.rating,
          updatedAt: remoteAt,
        });
      } else {
        removeRemote.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const dedupedAdds = dedupeByKey(addRemote);
  if (dedupedAdds.length > 0) {
    await deps.traktApi.addRatings(
      ctx.accessToken,
      toTraktRatingsBody(dedupedAdds),
    );
  }

  const dedupedRemovals = dedupeByKey(removeRemote);
  if (dedupedRemovals.length > 0) {
    await deps.traktApi.removeRatings(
      ctx.accessToken,
      toTraktFavoritesBody(dedupedRemovals),
    );
  }
}
