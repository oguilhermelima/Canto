import { torrentSearchInput } from "@canto/validators";

import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import { searchTorrents } from "@canto/core/domain/torrents/use-cases/search-torrents";
import {
  DEFAULT_SCORING_RULES,
  applyDownloadPreferences,
} from "@canto/core/domain/shared/rules/scoring-rules";
import { findDownloadPreferences } from "@canto/core/infra/user/preferences-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentSearchRouter = createTRPCRouter({
  search: adminProcedure
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const [indexers, prefs] = await Promise.all([
        buildIndexers(),
        findDownloadPreferences(ctx.db, ctx.session.user.id),
      ]);
      const rules = applyDownloadPreferences(DEFAULT_SCORING_RULES, prefs);
      return searchTorrents(ctx.db, input, indexers, rules);
    }),
});
