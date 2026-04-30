import { and, eq } from "drizzle-orm";
import { list } from "@canto/db/schema";
import {
  syncSingleListMembership,
  toTraktListBody
  
  
} from "@canto/core/domain/trakt/use-cases/shared";
import type {SyncContext, SyncListMembershipDeps} from "@canto/core/domain/trakt/use-cases/shared";
import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";

export interface SyncWatchlistDeps extends SyncListMembershipDeps {
  traktApi: TraktApiPort;
}

export async function syncWatchlist(
  ctx: SyncContext,
  deps: SyncWatchlistDeps,
): Promise<void> {
  const watchlist = await ctx.db.query.list.findFirst({
    where: and(eq(list.userId, ctx.userId), eq(list.type, "watchlist")),
  });
  if (!watchlist) return;

  const remoteWatchlist = await deps.traktApi.listWatchlist(
    ctx.accessToken,
    ctx.profileId,
  );

  await syncSingleListMembership(
    ctx,
    deps,
    watchlist.id,
    remoteWatchlist,
    (refs) =>
      deps.traktApi.addToWatchlist(ctx.accessToken, toTraktListBody(refs)),
    (refs) =>
      deps.traktApi.removeFromWatchlist(ctx.accessToken, toTraktListBody(refs)),
  );
}
