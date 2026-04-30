import type {
  ApplyArgs,
  MediaEnrichmentStrategy,
  SharedMetadataResponse,
} from "@canto/core/domain/media/enrichment/types";

/**
 * Per-region content rating rows. The shared `tmdb.metadata` response carries
 * `contentRatings`, and `updateMediaFromNormalized → persistContentRatings`
 * has already written them by the time this strategy runs. We just publish
 * the count for the run summary.
 */
export const contentRatingsStrategy: MediaEnrichmentStrategy<
  SharedMetadataResponse | undefined
> = {
  aspect: "contentRatings",
  dependsOn: ["metadata"],
  needs: "tmdb.metadata",
  async applyToAspect(
    args: ApplyArgs<SharedMetadataResponse | undefined>,
  ) {
    const { ctx, response } = args;
    const count = response?.media.contentRatings?.length ?? 0;
    ctx.result.writes.contentRatings = count;
    ctx.result.aspectsExecuted.push("contentRatings");
    return "data";
  },
};
