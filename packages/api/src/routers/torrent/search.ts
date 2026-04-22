import { torrentSearchInput } from "@canto/validators";

import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import { searchTorrents } from "@canto/core/domain/torrents/use-cases/search-torrents";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentSearchRouter = createTRPCRouter({
  search: adminProcedure
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const indexers = await buildIndexers();
      return searchTorrents(ctx.db, input, indexers);
    }),
});
