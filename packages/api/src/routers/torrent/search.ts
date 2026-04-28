import {
  torrentSearchInput,
  torrentSearchOnIndexerInput,
} from "@canto/validators";

import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import {
  listIndexerInfo,
  searchOnIndexer,
  searchTorrents,
} from "@canto/core/domain/torrents/use-cases/search-torrents";
import { composeDownloadRules } from "@canto/core/domain/shared/rules/scoring-rules";
import { findDownloadPreferences } from "@canto/core/infra/user/preferences-repository";
import { findDownloadConfig } from "@canto/core/infra/torrents/download-config-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentSearchRouter = createTRPCRouter({
  /** Batch search — runs every enabled indexer and waits for the slowest.
   *  Used by the mobile client and by background jobs that don't have a
   *  reason to stream. */
  search: adminProcedure
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const [indexers, prefs, config] = await Promise.all([
        buildIndexers(),
        findDownloadPreferences(ctx.db, ctx.session.user.id),
        findDownloadConfig(ctx.db),
      ]);
      return searchTorrents(ctx.db, input, indexers, composeDownloadRules(config, prefs));
    }),

  /** Snapshot of every enabled indexer (id + display name). Drives the
   *  per-indexer chip rendering in the streaming search UI. */
  listIndexers: adminProcedure.query(async () => {
    const indexers = await buildIndexers();
    return listIndexerInfo(indexers);
  }),

  /** Single-indexer search. The web client calls this once per enabled
   *  indexer in parallel via tRPC `useQueries`, so a slow indexer never
   *  delays the results from the fast ones. */
  searchOnIndexer: adminProcedure
    .input(torrentSearchOnIndexerInput)
    .query(async ({ ctx, input }) => {
      const [indexers, prefs, config] = await Promise.all([
        buildIndexers(),
        findDownloadPreferences(ctx.db, ctx.session.user.id),
        findDownloadConfig(ctx.db),
      ]);
      return searchOnIndexer(ctx.db, input, indexers, composeDownloadRules(config, prefs));
    }),
});
