/**
 * One-shot backfill. Re-fetches the user's Trakt watchlist / favorites /
 * ratings / custom lists and overwrites the corresponding local rows'
 * createdAt/updatedAt/addedAt with the real Trakt timestamps.
 *
 * The going-forward sync code already stamps these correctly via the new
 * upsert helpers (with GREATEST semantics so they never go backward). This
 * script exists for users whose rows were imported before the timestamp
 * fix landed — those rows are stuck at the sync run's `now()` and need a
 * direct overwrite (which GREATEST blocks for safety reasons).
 *
 * Usage:
 *   pnpm dotenv -e ../../.env -- tsx src/scripts/backfill-trakt-timestamps.ts <userId>
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@canto/db/client";
import {
  listItem,
  list,
  userConnection,
  userMediaState,
  userRating,
} from "@canto/db/schema";
import { findMediaByAnyReference } from "@canto/core/infra/repositories";
import { findTraktListLinksByConnection } from "@canto/core/infra/trakt/trakt-sync-repository";
import { updateUserConnection } from "@canto/core/infra/media-servers/user-connection-repository";
import {
  listTraktFavorites,
  listTraktListItems,
  listTraktRatings,
  listTraktWatchlist,
  refreshTraktAccessTokenIfNeeded,
  type TraktIds,
  type TraktMediaRef,
} from "@canto/core/infra/trakt/trakt.adapter";

interface ConnContext {
  connectionId: string;
  accessToken: string;
  profileId: string;
}

async function resolveLocalMedia(
  type: "movie" | "show",
  ids: TraktIds,
): Promise<string | null> {
  const externalId = ids.tmdb ?? ids.tvdb ?? 0;
  if (!externalId) return null;
  const found = await findMediaByAnyReference(
    db,
    externalId,
    ids.tmdb ? "tmdb" : "tvdb",
    ids.imdb,
    ids.tvdb,
    type,
  );
  return found?.id ?? null;
}

async function backfillListItemAddedAt(
  refs: TraktMediaRef[],
  localListId: string,
): Promise<{ scanned: number; updated: number }> {
  let updated = 0;
  for (const ref of refs) {
    if (!ref.listedAt) continue;
    const mediaId = await resolveLocalMedia(ref.type, ref.ids);
    if (!mediaId) continue;
    const result = await db
      .update(listItem)
      .set({ addedAt: new Date(ref.listedAt) })
      .where(
        and(
          eq(listItem.listId, localListId),
          eq(listItem.mediaId, mediaId),
          sql`${listItem.deletedAt} IS NULL`,
        ),
      )
      .returning({ id: listItem.id });
    if (result.length > 0) updated += 1;
  }
  return { scanned: refs.length, updated };
}

async function backfillFavorites(
  ctx: ConnContext,
  userId: string,
): Promise<{ scanned: number; updated: number }> {
  const refs = await listTraktFavorites(ctx.accessToken, ctx.profileId);
  let updated = 0;
  for (const ref of refs) {
    if (!ref.listedAt) continue;
    const mediaId = await resolveLocalMedia(ref.type, ref.ids);
    if (!mediaId) continue;
    const stamp = new Date(ref.listedAt);
    const result = await db
      .update(userMediaState)
      .set({
        updatedAt: stamp,
      })
      .where(
        and(
          eq(userMediaState.userId, userId),
          eq(userMediaState.mediaId, mediaId),
          eq(userMediaState.isFavorite, true),
        ),
      )
      .returning();
    if (result.length > 0) updated += 1;
  }
  return { scanned: refs.length, updated };
}

async function backfillRatings(
  ctx: ConnContext,
  userId: string,
): Promise<{ scanned: number; ratingUpdated: number; stateUpdated: number }> {
  const refs = await listTraktRatings(ctx.accessToken, ctx.profileId);
  let ratingUpdated = 0;
  let stateUpdated = 0;
  for (const ref of refs) {
    if (!ref.ratedAt) continue;
    const mediaId = await resolveLocalMedia(ref.type, ref.ids);
    if (!mediaId) continue;
    const stamp = new Date(ref.ratedAt);

    // Update user_rating (media-level — the sync only writes media-level).
    const ratingResult = await db
      .update(userRating)
      .set({ createdAt: stamp, updatedAt: stamp })
      .where(
        and(
          eq(userRating.userId, userId),
          eq(userRating.mediaId, mediaId),
          isNull(userRating.seasonId),
          isNull(userRating.episodeId),
        ),
      )
      .returning();
    if (ratingResult.length > 0) ratingUpdated += 1;

    // Bump user_media_state.updated_at if the row's rating column was
    // populated by this rating sync. We only move it backward — anything
    // newer locally (a later watch, a new favorite) wins.
    const stateResult = await db
      .update(userMediaState)
      .set({ updatedAt: stamp })
      .where(
        and(
          eq(userMediaState.userId, userId),
          eq(userMediaState.mediaId, mediaId),
        ),
      )
      .returning();
    if (stateResult.length > 0) stateUpdated += 1;
  }
  return { scanned: refs.length, ratingUpdated, stateUpdated };
}

async function backfillWatchlist(
  ctx: ConnContext,
  userId: string,
): Promise<{ scanned: number; updated: number }> {
  const watchlistList = await db.query.list.findFirst({
    where: and(eq(list.userId, userId), eq(list.type, "watchlist")),
  });
  if (!watchlistList) return { scanned: 0, updated: 0 };
  const refs = await listTraktWatchlist(ctx.accessToken, ctx.profileId);
  return backfillListItemAddedAt(refs, watchlistList.id);
}

async function backfillCustomLists(
  ctx: ConnContext,
): Promise<{ scanned: number; updated: number }> {
  const links = await findTraktListLinksByConnection(db, ctx.connectionId);
  let scanned = 0;
  let updated = 0;
  for (const link of links) {
    const refs = await listTraktListItems(
      ctx.accessToken,
      link.traktListId,
      ctx.profileId,
    );
    const r = await backfillListItemAddedAt(refs, link.localListId);
    scanned += r.scanned;
    updated += r.updated;
  }
  return { scanned, updated };
}

async function main(): Promise<void> {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: tsx backfill-trakt-timestamps.ts <userId>");
    process.exit(1);
  }

  const conns = await db.query.userConnection.findMany({
    where: and(
      eq(userConnection.userId, userId),
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
    ),
  });

  if (conns.length === 0) {
    console.error(`No Trakt connections for user ${userId}`);
    process.exit(1);
  }

  for (const conn of conns) {
    if (!conn.token) continue;
    const { accessToken } = await refreshTraktAccessTokenIfNeeded(
      conn,
      (patch) => updateUserConnection(db, conn.id, patch).then(() => undefined),
    );
    const ctx: ConnContext = {
      connectionId: conn.id,
      accessToken,
      profileId: conn.externalUserId ?? "me",
    };

    console.log(`\n=== connection ${conn.id} ===`);

    const wl = await backfillWatchlist(ctx, userId);
    console.log(`watchlist: scanned=${wl.scanned} updated=${wl.updated}`);

    const fav = await backfillFavorites(ctx, userId);
    console.log(`favorites: scanned=${fav.scanned} updated=${fav.updated}`);

    const rat = await backfillRatings(ctx, userId);
    console.log(
      `ratings: scanned=${rat.scanned} userRating.updated=${rat.ratingUpdated} state.updated=${rat.stateUpdated}`,
    );

    const cl = await backfillCustomLists(ctx);
    console.log(`custom lists: scanned=${cl.scanned} updated=${cl.updated}`);
  }

  process.exit(0);
}

void main();
