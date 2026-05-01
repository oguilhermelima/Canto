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
import type { UserId } from "@canto/core/domain/user/types/user";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeTorrentsRepository } from "@canto/core/infra/torrents/torrents-repository.adapter";
import { makeUserRepository } from "@canto/core/infra/user/user-repository.adapter";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentSearchRouter = createTRPCRouter({
  search: adminProcedure
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const torrents = makeTorrentsRepository(ctx.db);
      const userRepo = makeUserRepository(ctx.db);
      const [indexers, prefs, config] = await Promise.all([
        buildIndexers(),
        userRepo.findDownloadPreferences(ctx.session.user.id as UserId),
        torrents.findDownloadConfig(),
      ]);
      return searchTorrents(ctx.db, input, {
        indexers,
        rules: composeDownloadRules(config, prefs),
        torrents,
        media: makeMediaRepository(ctx.db),
        localization: makeMediaLocalizationRepository(ctx.db),
      });
    }),

  listIndexers: adminProcedure.query(async () => {
    const indexers = await buildIndexers();
    return listIndexerInfo(indexers);
  }),

  searchOnIndexer: adminProcedure
    .input(torrentSearchOnIndexerInput)
    .query(async ({ ctx, input }) => {
      const torrents = makeTorrentsRepository(ctx.db);
      const userRepo = makeUserRepository(ctx.db);
      const [indexers, prefs, config] = await Promise.all([
        buildIndexers(),
        userRepo.findDownloadPreferences(ctx.session.user.id as UserId),
        torrents.findDownloadConfig(),
      ]);
      return searchOnIndexer(ctx.db, input, {
        indexers,
        rules: composeDownloadRules(config, prefs),
        torrents,
        media: makeMediaRepository(ctx.db),
        localization: makeMediaLocalizationRepository(ctx.db),
      });
    }),
});
