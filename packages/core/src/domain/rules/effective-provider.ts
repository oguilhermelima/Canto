import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";

export type EffectiveProvider = "tmdb" | "tvdb";

interface ProviderInput {
  overrideProviderFor: string | null;
  provider: string;
  type: string;
}

/**
 * Determine the effective provider for a media item's structure and naming.
 *
 * Priority:
 * 1. Per-media override (`overrideProviderFor`)
 * 2. Global setting (`tvdb.defaultShows`) for shows
 * 3. Original provider
 */
export function getEffectiveProviderSync(
  media: ProviderInput,
  globalTvdbEnabled: boolean,
): EffectiveProvider {
  if (media.overrideProviderFor === "tvdb" || media.overrideProviderFor === "tmdb") {
    return media.overrideProviderFor;
  }
  if (globalTvdbEnabled && media.type === "show") {
    return "tvdb";
  }
  return media.provider as EffectiveProvider;
}

/** Async version that reads the global setting from DB. */
export async function getEffectiveProvider(
  media: ProviderInput,
): Promise<EffectiveProvider> {
  const globalTvdbEnabled =
    (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;
  return getEffectiveProviderSync(media, globalTvdbEnabled);
}
