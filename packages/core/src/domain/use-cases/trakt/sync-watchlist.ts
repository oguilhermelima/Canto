import { and, eq } from "drizzle-orm";
import { list } from "@canto/db/schema";
import {
  addToTraktWatchlist,
  listTraktWatchlist,
  removeFromTraktWatchlist,
} from "../../../infrastructure/adapters/trakt/client";
import {
  syncSingleListMembership,
  toTraktListBody,
  type SyncContext,
} from "./shared";

export async function syncWatchlist(ctx: SyncContext): Promise<void> {
  const watchlist = await ctx.db.query.list.findFirst({
    where: and(eq(list.userId, ctx.userId), eq(list.type, "watchlist")),
  });
  if (!watchlist) return;

  const remoteWatchlist = await listTraktWatchlist(
    ctx.accessToken,
    ctx.profileId,
  );

  await syncSingleListMembership(
    ctx,
    watchlist.id,
    remoteWatchlist,
    (refs) => addToTraktWatchlist(ctx.accessToken, toTraktListBody(refs)),
    (refs) => removeFromTraktWatchlist(ctx.accessToken, toTraktListBody(refs)),
  );
}
