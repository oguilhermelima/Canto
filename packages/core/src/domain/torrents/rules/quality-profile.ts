import type { Quality, Source } from "../types/common";
import { QUALITY_HIERARCHY, SOURCE_HIERARCHY } from "./quality";
import type { ScoringRules } from "../../shared/rules/scoring-rules";

/**
 * One entry in {@link QualityProfile.allowedFormats}. Releases whose
 * (quality, source) combo is not in `allowedFormats` are rejected by the
 * scoring engine; releases that match earn the entry's `weight` as a base
 * score on top of the TRaSH bonuses computed from the rules.
 */
export interface QualityProfileAllowedFormat {
  quality: Quality;
  source: Source;
  weight: number;
}

/**
 * Quality profile — the user-facing answer to "what releases am I willing
 * to download for this library?". A profile decouples the **policy** of
 * which (quality, source) combos to accept and prefer from the **bonuses**
 * that further rank them (HDR, audio codec, release group tier — those
 * stay in {@link ScoringRules}).
 */
export interface QualityProfile {
  id: string;
  name: string;
  flavor: "movie" | "show" | "anime";
  allowedFormats: QualityProfileAllowedFormat[];
  /** Releases at or above this combo don't trigger upgrade searches.
   *  Both fields null = no cutoff (always look for upgrades). */
  cutoffQuality: Quality | null;
  cutoffSource: Source | null;
  /** Minimum total score (profile weight + TRaSH bonuses). 0 = no
   *  filter beyond the allowedFormats whitelist. */
  minTotalScore: number;
  isDefault: boolean;
}

/**
 * Lookup the (quality, source) entry inside a profile. Returns `null` if
 * the combo isn't in `allowedFormats` (which means: rejected).
 */
export function findAllowedFormat(
  profile: QualityProfile,
  quality: Quality,
  source: Source,
): QualityProfileAllowedFormat | null {
  for (const entry of profile.allowedFormats) {
    if (entry.quality === quality && entry.source === source) return entry;
  }
  return null;
}

/**
 * Whether the given (quality, source) combo meets or exceeds the profile's
 * cutoff. Used by the upgrade flow to decide "do we keep searching for
 * better releases of this media?".
 *
 * Cutoff comparison uses {@link QUALITY_HIERARCHY} / {@link SOURCE_HIERARCHY}
 * (lower index = better). A combo "meets cutoff" when both quality and
 * source rank at-or-above the cutoff.
 *
 * Returns `false` when the profile has no cutoff (always search).
 */
export function meetsCutoff(
  profile: QualityProfile,
  quality: Quality,
  source: Source,
): boolean {
  if (!profile.cutoffQuality || !profile.cutoffSource) return false;
  const qIdx = QUALITY_HIERARCHY.indexOf(quality);
  const cQIdx = QUALITY_HIERARCHY.indexOf(profile.cutoffQuality);
  if (qIdx === -1 || cQIdx === -1) return false;
  if (qIdx > cQIdx) return false; // candidate quality is worse
  if (qIdx < cQIdx) return true; // candidate quality is strictly better
  // Same quality — compare source.
  const sIdx = SOURCE_HIERARCHY.indexOf(source);
  const cSIdx = SOURCE_HIERARCHY.indexOf(profile.cutoffSource);
  if (sIdx === -1 || cSIdx === -1) return false;
  return sIdx <= cSIdx;
}

/**
 * Comparison verdict for an upgrade candidate vs a current download under
 * a profile. Used by {@link compareToProfile} to drive the auto-replace
 * flow.
 */
export type ProfileComparisonVerdict =
  | "candidate-not-allowed"
  | "current-not-allowed"
  | "upgrade"
  | "downgrade"
  | "equivalent";

/**
 * Compare a candidate release against the currently-downloaded version
 * under a quality profile. Returns whether the candidate is an upgrade,
 * a downgrade, equivalent, or outside the profile's allowed set.
 *
 * Comparison rule: higher `weight` in `allowedFormats` wins. If both have
 * the same weight, the verdict is `"equivalent"` — the upgrade flow
 * should not auto-replace equivalents (we don't know the candidate is
 * actually better; only that it's allowed).
 */
export function compareToProfile(
  current: { quality: Quality; source: Source },
  candidate: { quality: Quality; source: Source },
  profile: QualityProfile,
): ProfileComparisonVerdict {
  const candEntry = findAllowedFormat(
    profile,
    candidate.quality,
    candidate.source,
  );
  if (!candEntry) return "candidate-not-allowed";
  const currEntry = findAllowedFormat(
    profile,
    current.quality,
    current.source,
  );
  if (!currEntry) return "current-not-allowed";
  if (candEntry.weight > currEntry.weight) return "upgrade";
  if (candEntry.weight < currEntry.weight) return "downgrade";
  return "equivalent";
}

/**
 * Apply a profile as an overlay on top of base scoring rules. The profile
 * populates `allowedFormats` — releases whose (quality, source) combo
 * isn't on the list are rejected outright by the engine. The remaining
 * rules (HDR / audio / codec / group tier / etc) stay intact, so TRaSH
 * bonuses still rank allowed releases against each other.
 *
 * Pure — input is not mutated.
 */
export function applyQualityProfile(
  base: ScoringRules,
  profile: QualityProfile,
): ScoringRules {
  return {
    ...base,
    allowedFormats: profile.allowedFormats.map((entry) => ({ ...entry })),
    minTotalScore: profile.minTotalScore,
  };
}
