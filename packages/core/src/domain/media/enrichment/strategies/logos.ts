import type { MediaType } from "@canto/providers";

import type {
  ApplyArgs,
  MediaEnrichmentStrategy,
} from "@canto/core/domain/media/enrichment/types";
import type { Outcome } from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";
import { fetchAndPersistLogos } from "@canto/core/domain/media/use-cases/fetch-and-persist-logos";

/**
 * Per-language `media_translation.logo_path`. `fetchAndPersistLogos` covers
 * every supported language in a single TMDB `/images` call and upserts the
 * best match per language, so multiple plan scopes for this aspect collapse
 * onto one provider call. We memoize the outcome on `ctx.scratch` so sibling
 * scopes reuse the result instead of re-firing.
 */
export const logosStrategy: MediaEnrichmentStrategy<undefined> = {
  aspect: "logos",
  dependsOn: ["metadata"],
  needs: "tmdb.images",
  async applyToAspect(args: ApplyArgs<undefined>) {
    const { mediaId, ctx, deps } = args;

    const cached = readCache(ctx);
    if (cached.fired) {
      if (cached.error) throw cached.error;
      return cached.outcome ?? "data";
    }
    cached.fired = true;

    try {
      const written = await fetchAndPersistLogos(
        { localization: ctx.deps.localization },
        mediaId,
        ctx.mediaRow.externalId,
        ctx.mediaRow.type as MediaType,
        ctx.languages,
        deps.tmdb,
      );
      ctx.result.providerCalls.tmdb += written.calls;
      ctx.result.writes.logos = written.writes;
      if (written.calls > 0) ctx.result.aspectsExecuted.push("logos");
      cached.outcome = written.writes === 0 ? "empty" : "data";
    } catch (err) {
      cached.error = err;
      throw err;
    }

    return cached.outcome ?? "data";
  },
};

interface LogosScratch {
  fired: boolean;
  outcome?: Outcome;
  error?: unknown;
}

function readCache(ctx: { scratch: Record<string, unknown> }): LogosScratch {
  const existing = ctx.scratch.logos as LogosScratch | undefined;
  if (existing) return existing;
  const next: LogosScratch = { fired: false };
  ctx.scratch.logos = next;
  return next;
}
