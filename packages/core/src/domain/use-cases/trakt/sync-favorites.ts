import { and, eq } from "drizzle-orm";
import { media, userMediaState } from "@canto/db/schema";
import { upsertUserMediaState } from "../../../infrastructure/repositories";
import {
  addTraktFavorites,
  listTraktFavorites,
  removeTraktFavorites,
  type TraktIds,
  type TraktMediaRef,
} from "../../../infrastructure/adapters/trakt/client";
import {
  decidePresenceAction,
  dedupeByKey,
  mediaIdsFromRow,
  mediaRefKey,
  parseDateOrNow,
  resolveMediaFromTraktRef,
  toTraktFavoritesBody,
  type LocalMediaRef,
  type SyncContext,
} from "./shared";

export async function syncFavorites(ctx: SyncContext): Promise<void> {
  const localRows = await ctx.db
    .select({
      mediaId: userMediaState.mediaId,
      updatedAt: userMediaState.updatedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .where(
      and(
        eq(userMediaState.userId, ctx.userId),
        eq(userMediaState.isFavorite, true),
      ),
    );

  const remoteRows = await listTraktFavorites(ctx.accessToken, ctx.profileId);

  const localByKey = new Map<string, LocalMediaRef>();
  for (const local of localRows) {
    const mapped: LocalMediaRef = {
      mediaId: local.mediaId,
      type: local.type === "show" ? "show" : "movie",
      ids: mediaIdsFromRow(local),
      occurredAt: local.updatedAt,
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

  const addRemote: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const removeRemote: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const resolveCache = new Map<string, string | null>();

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (local && remote) continue;

    if (local && !remote) {
      const keepPresence = decidePresenceAction(
        local.occurredAt,
        ctx.now,
        ctx.initialSync,
      );
      if (keepPresence === "keep-presence") {
        addRemote.push({ type: local.type, ids: local.ids });
      } else {
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          isFavorite: false,
        });
      }
      continue;
    }

    if (!local && remote) {
      const remoteAt = parseDateOrNow(remote.listedAt, ctx.now);
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
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId,
          isFavorite: true,
        });
      } else {
        removeRemote.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const dedupedAdds = dedupeByKey(addRemote);
  if (dedupedAdds.length > 0) {
    await addTraktFavorites(ctx.accessToken, toTraktFavoritesBody(dedupedAdds));
  }

  const dedupedRemovals = dedupeByKey(removeRemote);
  if (dedupedRemovals.length > 0) {
    await removeTraktFavorites(
      ctx.accessToken,
      toTraktFavoritesBody(dedupedRemovals),
    );
  }
}
