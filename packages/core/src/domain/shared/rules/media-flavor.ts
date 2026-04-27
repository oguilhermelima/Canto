import type { ReleaseFlavor } from "../../torrents/rules/release-groups";

/**
 * Subset of media columns needed to derive the {@link ReleaseFlavor}.
 * Pulled out so the helper stays a pure function over data the caller
 * already has.
 */
export interface MediaFlavorSignals {
  type: "movie" | "show";
  originCountry?: string[] | null;
  originalLanguage?: string | null;
  genres?: string[] | null;
  genreIds?: number[] | null;
}

const TMDB_ANIMATION_GENRE_ID = 16;

/**
 * Classify a media row as movie / show / anime for scoring purposes.
 *
 * Anime here means "Japanese-origin animation" — TRaSH's anime guide is
 * narrower than "any cartoon", and treating Pixar/Disney like anime
 * would mis-pick the wrong release-group tier list. The heuristic
 * therefore requires *both* a Japanese-origin signal (originCountry
 * includes "JP" or originalLanguage is "ja") *and* an animation signal
 * (Animation genre / TMDB genre id 16).
 *
 * Misses (false negatives) are acceptable — a JP-tagless anime falls
 * back to its native type bucket and just doesn't get the anime-tier
 * group bonus. False positives would corrupt scoring more visibly, so
 * we err strict.
 */
export function resolveMediaFlavor(
  media: MediaFlavorSignals,
): ReleaseFlavor {
  const isJapanese =
    (media.originCountry?.includes("JP") ?? false) ||
    media.originalLanguage === "ja";

  const isAnimation =
    (media.genreIds?.includes(TMDB_ANIMATION_GENRE_ID) ?? false) ||
    (media.genres?.includes("Animation") ?? false);

  if (isJapanese && isAnimation) return "anime";
  return media.type === "movie" ? "movie" : "show";
}
