import type { Quality, Source } from "../../torrents/types/common";
import type { ReleaseGroupTier } from "../../torrents/rules/release-groups";

/**
 * Configurable scoring rules. The {@link calculateConfidence} engine is
 * a pure function of `(attrs, ctx, rules)` — every weight, threshold and
 * bonus lives in this object so it can be overridden per-user (Phase 2),
 * per-quality-profile (Phase 5), or per-test.
 *
 * Layered overrides (Phase 2+) are applied via {@link mergeScoringRules},
 * which does a shallow merge with per-record key-level merge for the
 * dictionary-shaped fields.
 */
export interface ScoringRules {
  /** Health by seeder count. First entry where `seeders >= threshold` wins. */
  health: Array<{ threshold: number; bonus: number }>;

  /** Freshness by age in days. First entry where `age <= threshold` wins. */
  freshness: Array<{ threshold: number; bonus: number }>;

  /** Per-axis fallback for the (quality, source) score contribution.
   *  Used when {@link allowedFormats} is null; ignored otherwise. */
  quality: Record<Quality, number>;
  source: Record<Source, number>;
  /** Whitelist of (quality, source) combos with their joint weight. When
   *  set, the engine ignores the per-axis lookups and rejects any release
   *  whose combo isn't on the list. Null = no whitelist (fallback to
   *  per-axis). Phase 5 quality profiles populate this field; without a
   *  profile it stays null. */
  allowedFormats:
    | Array<{ quality: Quality; source: Source; weight: number }>
    | null;
  hdr: Record<string, number>;
  audioCodec: Record<string, number>;
  audioChannels: Record<string, number>;
  groupTier: Record<ReleaseGroupTier, number>;

  /** Codec scoring is context-aware. The `default` table is used for any
   *  quality not present as a top-level key. */
  codec: {
    byQuality: Partial<Record<Quality, Record<string, number>>> & {
      default: Record<string, number>;
    };
  };

  /** Per-language bonus. Default empty; user prefs (Phase 2) populate it. */
  languageBonuses: Record<string, number>;
  /** Per-streaming-service bonus. Default has every known tag at +1. */
  streamingServiceBonuses: Record<string, number>;
  /** Per-edition bonus. Positive = preferred, negative = avoided. */
  editionBonuses: Record<string, number>;

  /** Indexer flags split into mutually-exclusive (first-match) and additive. */
  flags: {
    exclusive: Array<{ flag: string; bonus: number }>;
    additive: Record<string, number>;
  };

  multiAudioToken: number;
  multipleLanguagesBonus: number;
  hybridBonus: number;
  repackPerCount: number;
  repackMaxBonus: number;
  comboUhdRemuxDvAtmos: number;
  uhdNoHdrPenalty: number;
  camWithDigitalPenalty: number;
  camNoDigitalPenalty: number;

  /** Bonuses applied when user preferences match. Used by
   *  {@link applyDownloadPreferences} to layer per-user bumps onto the
   *  dictionary fields. */
  preferenceBonuses: {
    perPreferredLanguage: number;
    perPreferredStreamingService: number;
    preferredEdition: number;
    avoidedEdition: number;
    /** Magnitude of the AV1 stance bump (added when "prefer", subtracted
     *  when "avoid"). Tuned so it doesn't drown source/quality signals. */
    av1Stance: number;
  };

  /** Used for normalising the raw score to 0–100. */
  maxRaw: number;

  /** Final filter on the normalised score (0–100). Releases below this
   *  threshold are returned as 0 (i.e. dropped by the search). 0 = no
   *  threshold. Phase 5 quality profiles populate this from the profile;
   *  defaults expose it for convenience but leave it disabled. */
  minTotalScore: number;
}

/** Codec stance toward AV1. Default is "neutral" — AV1 is treated like
 *  any other modern codec by the rules. "prefer"/"avoid" bump the
 *  AV1-specific entries in {@link ScoringRules.codec.byQuality}. */
export type Av1Stance = "neutral" | "prefer" | "avoid";

/**
 * Per-user download preferences expressed as flat lists. The downstream
 * scoring engine never reads these directly — {@link applyDownloadPreferences}
 * folds them into a {@link ScoringRules} as bumps to the dictionary fields.
 */
export interface DownloadPreferences {
  /** ISO codes (matches {@link detectLanguages}'s output). */
  preferredLanguages: string[];
  /** Tag codes from {@link detectStreamingService} (NF/AMZN/...). */
  preferredStreamingServices: string[];
  /** Edition strings from {@link detectEdition} ("IMAX", "Director's Cut", …). */
  preferredEditions: string[];
  /** Editions that should rank below their absence. */
  avoidedEditions: string[];
  /** Whether to nudge AV1 releases up, down, or leave them alone. */
  av1Stance: Av1Stance;
}

export const EMPTY_DOWNLOAD_PREFERENCES: DownloadPreferences = {
  preferredLanguages: [],
  preferredStreamingServices: [],
  preferredEditions: [],
  avoidedEditions: [],
  av1Stance: "neutral",
};

/**
 * Layer a user's download preferences onto a base {@link ScoringRules}.
 *
 * Bonuses live in `base.preferenceBonuses` so a Phase-5 quality profile
 * could change the weights without rewriting this function. Each preferred
 * language adds `perPreferredLanguage` to that language's `languageBonuses`
 * entry (additive — Phase 5 profile language boosts compose with user
 * boosts). Streaming services and editions follow the same pattern.
 *
 * Pure — returns a new rules object; the input is not mutated.
 */
export function applyDownloadPreferences(
  base: ScoringRules,
  prefs: DownloadPreferences,
): ScoringRules {
  const {
    perPreferredLanguage,
    perPreferredStreamingService,
    preferredEdition,
    avoidedEdition,
    av1Stance: av1Bump,
  } = base.preferenceBonuses;

  const languageBonuses = { ...base.languageBonuses };
  for (const lang of prefs.preferredLanguages) {
    languageBonuses[lang] = (languageBonuses[lang] ?? 0) + perPreferredLanguage;
  }

  const streamingServiceBonuses = { ...base.streamingServiceBonuses };
  for (const svc of prefs.preferredStreamingServices) {
    streamingServiceBonuses[svc] =
      (streamingServiceBonuses[svc] ?? 0) + perPreferredStreamingService;
  }

  const editionBonuses = { ...base.editionBonuses };
  for (const ed of prefs.preferredEditions) {
    editionBonuses[ed] = (editionBonuses[ed] ?? 0) + preferredEdition;
  }
  for (const ed of prefs.avoidedEditions) {
    editionBonuses[ed] = (editionBonuses[ed] ?? 0) + avoidedEdition;
  }

  // AV1 stance: nudge AV1 entries in the codec table up or down. Applied
  // to every quality bucket so the user's stance carries over regardless
  // of resolution.
  let codec = base.codec;
  if (prefs.av1Stance !== "neutral") {
    const delta = prefs.av1Stance === "prefer" ? av1Bump : -av1Bump;
    const byQuality: typeof base.codec.byQuality = {
      ...base.codec.byQuality,
      default: { ...base.codec.byQuality.default },
    };
    byQuality.default.av1 = (byQuality.default.av1 ?? 0) + delta;
    for (const q of ["uhd", "fullhd", "hd", "sd"] as const) {
      const table = byQuality[q];
      if (table) {
        byQuality[q] = { ...table, av1: (table.av1 ?? 0) + delta };
      }
    }
    codec = { byQuality };
  }

  return {
    ...base,
    languageBonuses,
    streamingServiceBonuses,
    editionBonuses,
    codec,
  };
}

/**
 * Type-safe per-key merge for the dictionary-shaped rule fields.
 * Phase 2/Phase 5 layer user prefs and quality-profile overrides on top
 * of defaults using these helpers so the override only needs to specify
 * the keys it wants to change.
 *
 *   const rules = {
 *     ...base,
 *     streamingServiceBonuses: mergeRecord(
 *       base.streamingServiceBonuses,
 *       { NF: 4, ATVP: 3 },
 *     ),
 *   };
 */
export function mergeRecord<K extends string, V>(
  base: Record<K, V>,
  override: Partial<Record<K, V>> | undefined,
): Record<K, V> {
  if (!override) return base;
  return { ...base, ...override } as Record<K, V>;
}
