import { refreshExtras } from "@canto/core/domain/content-enrichment/use-cases/refresh-extras";
import type {
  ApplyArgs,
  MediaEnrichmentStrategy,
} from "@canto/core/domain/media/enrichment/types";

/**
 * Credits, videos, recommendations, watch providers. Delegates to the
 * existing `refreshExtras` use-case which owns its own TMDB call (with
 * cross-provider IMDB fallback when the row is TVDB-native) and the diff-
 * based recommendation upsert. Wave 9C threads the extras port through
 * `ctx.deps.extras` so the strategy never reaches back to the DB.
 *
 * `refresh-extras.ts` itself remains in place during this phase — the legacy
 * refresh-extras queue + worker are kept so any pre-existing in-flight jobs
 * still drain. New dispatches go through `ensureMedia` which reaches this
 * strategy.
 */
export const extrasStrategy: MediaEnrichmentStrategy<undefined> = {
  aspect: "extras",
  dependsOn: ["metadata"],
  needs: "tmdb.extras",
  async applyToAspect(args: ApplyArgs<undefined>) {
    const { db, mediaId, ctx, deps } = args;
    await refreshExtras(db, mediaId, {
      tmdb: deps.tmdb,
      extras: ctx.deps.extras,
      localization: ctx.deps.localization,
      media: ctx.deps.media,
      logger: ctx.deps.logger,
      dispatcher: ctx.deps.dispatcher,
      userPrefs: ctx.deps.userPrefs,
    });
    ctx.result.providerCalls.tmdb += 1;
    ctx.result.aspectsExecuted.push("extras");
    return "data";
  },
};
