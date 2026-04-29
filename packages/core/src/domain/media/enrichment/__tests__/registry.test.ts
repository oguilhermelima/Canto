import { describe, expect, it } from "vitest";

import { ALL_ASPECTS, type Aspect } from "../../use-cases/ensure-media.types";
import { enrichmentRegistry } from "../registry";
import type { MediaEnrichmentStrategy } from "../types";

describe("enrichmentRegistry", () => {
  it("binds a strategy for every Aspect", () => {
    // The Record<Aspect, MediaEnrichmentStrategy> shape gives us compile-time
    // exhaustiveness already, but we also check at runtime so a future
    // accidental cast doesn't paper over a missing binding.
    for (const aspect of ALL_ASPECTS) {
      const strategy = enrichmentRegistry[aspect];
      expect(strategy).toBeDefined();
      expect(strategy.aspect).toBe(aspect);
    }
  });

  it("only depends on aspects the registry knows about", () => {
    const known = new Set<Aspect>(ALL_ASPECTS);
    for (const aspect of ALL_ASPECTS) {
      const strategy = enrichmentRegistry[aspect];
      for (const dep of strategy.dependsOn) {
        expect(known.has(dep)).toBe(true);
      }
    }
  });

  it("has no self-dependencies", () => {
    for (const aspect of ALL_ASPECTS) {
      const strategy = enrichmentRegistry[aspect];
      expect(strategy.dependsOn).not.toContain(aspect);
    }
  });

  it("declares a known ApiCapability for every strategy", () => {
    const validCapabilities = new Set([
      "tmdb.metadata",
      "tmdb.extras",
      "tmdb.images",
      "tvdb.metadata",
      "tvdb.episodeTranslations",
    ]);
    for (const aspect of ALL_ASPECTS) {
      const strategy = enrichmentRegistry[aspect];
      expect(validCapabilities.has(strategy.needs)).toBe(true);
    }
  });

  it("each strategy is callable as MediaEnrichmentStrategy", () => {
    for (const aspect of ALL_ASPECTS) {
      const strategy: MediaEnrichmentStrategy = enrichmentRegistry[aspect];
      expect(typeof strategy.applyToAspect).toBe("function");
    }
  });
});
