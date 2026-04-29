import type { ProviderName } from "@canto/providers";

/**
 * Resolve the provider that should be used to enrich a given media row,
 * combining the per-media `overrideProviderFor` flag with the global
 * `tvdb.defaultShows` setting. Pure — no I/O.
 *
 * Resolution order:
 *  1. Per-media `overrideProviderFor` (when set, wins unconditionally).
 *  2. Type-aware default: shows fall through to TVDB when the global toggle is on.
 *  3. The provider already stored on the media row.
 */
export interface MediaEffectiveProviderInput {
  type: string;
  provider: string;
  overrideProviderFor: string | null;
}

export interface EffectiveProviderSettings {
  tvdbDefaultShows: boolean;
}

export function effectiveProvider(
  media: MediaEffectiveProviderInput,
  settings: EffectiveProviderSettings,
): ProviderName {
  if (media.overrideProviderFor === "tmdb" || media.overrideProviderFor === "tvdb") {
    return media.overrideProviderFor;
  }
  if (media.type === "show" && settings.tvdbDefaultShows) {
    return "tvdb";
  }
  // Fall through to whatever is on the row. Cast is safe because the media
  // table only ever stores the two recognised provider names; anything else
  // is an upstream bug that the type system should not silently swallow.
  return media.provider === "tvdb" ? "tvdb" : "tmdb";
}
