import { and, eq } from "drizzle-orm";
import { media, userMediaState } from "@canto/db/schema";
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
  type LocalMediaRef,
  type ResolveMediaDeps,
  type SyncContext,
} from "@canto/core/domain/trakt/use-cases/shared";

export interface SyncFavoritesDeps extends ResolveMediaDeps {
  traktApi: TraktApiPort;
  userMedia: UserMediaRepositoryPort;
}

export async function syncFavorites(
  ctx: SyncContext,
  deps: SyncFavoritesDeps,
): Promise<void> {
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

  const remoteRows = await deps.traktApi.listFavorites(
    ctx.accessToken,
    ctx.profileId,
  );

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
        await deps.userMedia.upsertState({
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
        deps,
        remote,
        resolveCache,
      );
      if (!mediaId) continue;

      if (keepPresence === "keep-presence") {
        await deps.userMedia.upsertState({
          userId: ctx.userId,
          mediaId,
          isFavorite: true,
          // Real "favorited at" time from Trakt — keeps the library's sort
          // by updatedAt and the recently-favorited feed honest.
          updatedAt: remoteAt,
        });
      } else {
        removeRemote.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const dedupedAdds = dedupeByKey(addRemote);
  if (dedupedAdds.length > 0) {
    await deps.traktApi.addFavorites(
      ctx.accessToken,
      toTraktFavoritesBody(dedupedAdds),
    );
  }

  const dedupedRemovals = dedupeByKey(removeRemote);
  if (dedupedRemovals.length > 0) {
    await deps.traktApi.removeFavorites(
      ctx.accessToken,
      toTraktFavoritesBody(dedupedRemovals),
    );
  }
}
