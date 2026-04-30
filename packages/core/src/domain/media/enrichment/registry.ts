import type { Aspect } from "@canto/core/domain/media/types/media-aspect-state";
import type { MediaEnrichmentStrategy } from "@canto/core/domain/media/enrichment/types";
import { contentRatingsStrategy } from "@canto/core/domain/media/enrichment/strategies/content-ratings";
import { extrasStrategy } from "@canto/core/domain/media/enrichment/strategies/extras";
import { logosStrategy } from "@canto/core/domain/media/enrichment/strategies/logos";
import { metadataStrategy } from "@canto/core/domain/media/enrichment/strategies/metadata";
import { structureStrategy } from "@canto/core/domain/media/enrichment/strategies/structure";
import { translationsStrategy } from "@canto/core/domain/media/enrichment/strategies/translations";

/**
 * Compile-time exhaustive `Aspect → strategy` map. The `Record<Aspect, …>`
 * shape forces TypeScript to flag any new `Aspect` value that lacks a
 * strategy binding.
 */
export const enrichmentRegistry: Record<
  Aspect,
  MediaEnrichmentStrategy
> = {
  metadata: metadataStrategy as MediaEnrichmentStrategy,
  structure: structureStrategy as MediaEnrichmentStrategy,
  translations: translationsStrategy as MediaEnrichmentStrategy,
  logos: logosStrategy as MediaEnrichmentStrategy,
  extras: extrasStrategy as MediaEnrichmentStrategy,
  contentRatings: contentRatingsStrategy as MediaEnrichmentStrategy,
};
