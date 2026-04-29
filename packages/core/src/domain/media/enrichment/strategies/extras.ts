import { refreshExtras } from "../../../content-enrichment/use-cases/refresh-extras";
import type { ApplyArgs, MediaEnrichmentStrategy } from "../types";

/**
 * Credits, videos, recommendations, watch providers. Delegates to the
 * existing `refreshExtras` use-case which owns its own TMDB call (with
 * cross-provider IMDB fallback when the row is TVDB-native) and the diff-
 * based recommendation upsert.
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
    await refreshExtras(db, mediaId, { tmdb: deps.tmdb });
    ctx.result.providerCalls.tmdb += 1;
    ctx.result.aspectsExecuted.push("extras");
    return "data";
  },
};
