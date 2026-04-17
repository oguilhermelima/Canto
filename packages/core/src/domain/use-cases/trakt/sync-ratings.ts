import { and, eq, isNull } from "drizzle-orm";
import { media, userRating } from "@canto/db/schema";
import {
  deleteUserRating,
  upsertUserMediaState,
  upsertUserRating,
} from "../../../infrastructure/repositories";
import {
  addTraktRatings,
  listTraktRatings,
  removeTraktRatings,
  type TraktIds,
  type TraktMediaRef,
} from "../../../infrastructure/adapters/trakt";
import {
  decidePresenceAction,
  dedupeByKey,
  mediaIdsFromRow,
  mediaRefKey,
  parseDateOrNow,
  resolveMediaFromTraktRef,
  toTraktFavoritesBody,
  toTraktRatingsBody,
  withinConflictWindow,
  type LocalRatingRef,
  type SyncContext,
} from "./shared";

export async function syncRatings(ctx: SyncContext): Promise<void> {
  const localRows = await ctx.db
    .select({
      mediaId: userRating.mediaId,
      rating: userRating.rating,
      updatedAt: userRating.updatedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(userRating)
    .innerJoin(media, eq(userRating.mediaId, media.id))
    .where(
      and(
        eq(userRating.userId, ctx.userId),
        isNull(userRating.seasonId),
        isNull(userRating.episodeId),
        eq(userRating.isOverride, true),
      ),
    );

  const remoteRows = await listTraktRatings(ctx.accessToken, ctx.profileId);

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
        await upsertUserRating(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          seasonId: null,
          episodeId: null,
          rating: remote.rating,
          isOverride: true,
        });
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          rating: remote.rating,
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
        await deleteUserRating(ctx.db, ctx.userId, local.mediaId, null, null);
        await upsertUserMediaState(ctx.db, {
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
        remote,
        resolveCache,
      );
      if (!mediaId) continue;

      if (keepPresence === "keep-presence") {
        await upsertUserRating(ctx.db, {
          userId: ctx.userId,
          mediaId,
          seasonId: null,
          episodeId: null,
          rating: remote.rating,
          isOverride: true,
        });
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId,
          rating: remote.rating,
        });
      } else {
        removeRemote.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const dedupedAdds = dedupeByKey(addRemote);
  if (dedupedAdds.length > 0) {
    await addTraktRatings(ctx.accessToken, toTraktRatingsBody(dedupedAdds));
  }

  const dedupedRemovals = dedupeByKey(removeRemote);
  if (dedupedRemovals.length > 0) {
    await removeTraktRatings(
      ctx.accessToken,
      toTraktFavoritesBody(dedupedRemovals),
    );
  }
}
