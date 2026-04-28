/**
 * Release-group classification.
 *
 * Movies, shows and anime use disjoint conventions, so the scoring
 * engine consults three separate tier lists, dispatched on a
 * {@link ReleaseFlavor} resolved from the media row. Inside each flavor
 * the tiers express how confident we are in the group:
 *
 *   - tier1   — top-shelf encoders / WEB rippers. The release will be a
 *               near-source-quality master.
 *   - tier2   — solid groups. A safe pick when no tier1 is available.
 *   - tier3   — competent but heterogeneous; tagging variance is high
 *               and quality less consistent.
 *   - neutral — group not on any list (the implicit default). No score
 *               adjustment.
 *   - avoid   — known low-quality re-encoders / scene throwaway groups.
 *               TRaSH treats these as "should never win unless nothing
 *               else exists".
 *
 * The actual tier rows live in the `download_release_group` table. Pure
 * lookups happen against {@link ReleaseGroupTierSets} maps hydrated from
 * that table once per search invocation.
 */

export type ReleaseGroupTier =
  | "tier1"
  | "tier2"
  | "tier3"
  | "neutral"
  | "avoid";

export type ReleaseFlavor = "movie" | "show" | "anime";

/**
 * Per-flavor lookup of which groups belong to which scored tier. The
 * keys are lowercased group names (lookups are case-insensitive). The
 * `download-config-repository` builds this from DB rows.
 */
export type ReleaseGroupTierSets = Record<
  Exclude<ReleaseGroupTier, "neutral">,
  Set<string>
>;

/**
 * Classify a release group within the context of a media flavor. Pure —
 * the lookup table is supplied by the caller (loaded once per search
 * from `download_release_group` rows).
 *
 * Returns `"neutral"` when the group is null or absent from every tier
 * — that maps to a 0 bonus in the scoring engine.
 */
export function classifyReleaseGroup(
  group: string | null,
  flavor: ReleaseFlavor,
  lookups: ReleaseGroupTierSets,
): ReleaseGroupTier {
  if (!group) return "neutral";
  const g = group.toLowerCase();
  if (lookups.tier1.has(g)) return "tier1";
  if (lookups.tier2.has(g)) return "tier2";
  if (lookups.tier3.has(g)) return "tier3";
  if (lookups.avoid.has(g)) return "avoid";
  return "neutral";
}
