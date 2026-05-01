import type {
  ApplyArgs,
  MediaEnrichmentStrategy,
  SharedMetadataResponse,
} from "@canto/core/domain/media/enrichment/types";
import { updateMediaFromNormalized } from "@canto/core/domain/media/use-cases/persist/core";

/**
 * Base media-row metadata. Writes the canonical English fields (title,
 * overview, genres, runtime, …) plus dual-writes the en-US localization row.
 *
 * The shared `tmdb.metadata` response also bundles seasons, translations and
 * content ratings — `updateMediaFromNormalized` drains all three in one
 * transaction. The `structure`, `translations`, and `contentRatings`
 * strategies that depend on this one rely on those side-effects already
 * being committed by the time they run.
 */
export const metadataStrategy: MediaEnrichmentStrategy<
  SharedMetadataResponse | undefined
> = {
  aspect: "metadata",
  dependsOn: [],
  needs: "tmdb.metadata",
  async applyToAspect(
    args: ApplyArgs<SharedMetadataResponse | undefined>,
  ) {
    const { db, mediaId, ctx, response } = args;
    if (!response) return "error_5xx";

    await updateMediaFromNormalized(db, mediaId, response.media, ctx.deps);
    ctx.result.writes.media = true;
    ctx.result.aspectsExecuted.push("metadata");
    return "data";
  },
};
