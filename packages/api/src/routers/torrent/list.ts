import {
  listLiveTorrentsInput,
  getByMediaIdInput,
} from "@canto/validators";

import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { listLiveTorrents } from "@canto/core/domain/torrents/use-cases/list-live-torrents";
import { mergeLiveData } from "@canto/core/domain/media/use-cases/merge-live-data";
import {
  findAllTorrents,
  findTorrentsByMediaId,
} from "@canto/core/infra/repositories";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentListRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) => findAllTorrents(ctx.db)),

  listByMedia: adminProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => findTorrentsByMediaId(ctx.db, input.mediaId)),

  listLive: adminProcedure
    .input(listLiveTorrentsInput)
    .query(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      return listLiveTorrents(ctx.db, input.limit, input.cursor, qb);
    }),

  listLiveByMedia: adminProcedure
    .input(getByMediaIdInput)
    .query(async ({ ctx, input }) => {
      const dbRows = await findTorrentsByMediaId(ctx.db, input.mediaId);
      if (dbRows.length === 0) return [];
      const qb = await getDownloadClient();
      const merged = await mergeLiveData(ctx.db, dbRows, qb);
      return merged.map((item) => ({ ...item.row, live: item.live }));
    }),

  listClient: adminProcedure.query(async ({ ctx }) => {
    const qb = await getDownloadClient();
    const [live, tracked] = await Promise.all([qb.listTorrents(), findAllTorrents(ctx.db)]);
    const byHash = new Map(tracked.filter((t) => !!t.hash).map((t) => [t.hash!, t]));
    return live
      .map((item) => {
        const linked = byHash.get(item.hash);
        return {
          hash: item.hash,
          name: item.name,
          state: item.state,
          progress: item.progress,
          size: item.size,
          dlspeed: item.dlspeed,
          upspeed: item.upspeed,
          eta: item.eta,
          addedOn: item.added_on,
          completionOn: item.completion_on,
          tracked: !!linked,
          trackedTorrentId: linked?.id ?? null,
          trackedMediaId: linked?.mediaId ?? null,
          trackedStatus: linked?.status ?? null,
        };
      })
      .sort((a, b) => b.addedOn - a.addedOn);
  }),
});
