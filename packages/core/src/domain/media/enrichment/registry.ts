import type { Aspect } from "../use-cases/ensure-media.types";
import type { MediaEnrichmentStrategy } from "./types";
import { metadataStrategy } from "./strategies/metadata";
import { structureStrategy } from "./strategies/structure";
import { translationsStrategy } from "./strategies/translations";
import { logosStrategy } from "./strategies/logos";
import { extrasStrategy } from "./strategies/extras";
import { contentRatingsStrategy } from "./strategies/content-ratings";

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
