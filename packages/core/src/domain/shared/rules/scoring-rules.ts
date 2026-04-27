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

  quality: Record<Quality, number>;
  source: Record<Source, number>;
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

  /** Used for normalising the raw score to 0–100. */
  maxRaw: number;
}

/**
 * TRaSH-aligned default scoring rules. Every weight is documented in
 * `scoring.ts` next to the engine that consumes it.
 */
export const DEFAULT_SCORING_RULES: ScoringRules = {
  health: [
    { threshold: 500, bonus: 40 },
    { threshold: 100, bonus: 35 },
    { threshold: 50, bonus: 30 },
    { threshold: 20, bonus: 25 },
    { threshold: 10, bonus: 20 },
    { threshold: 5, bonus: 15 },
    { threshold: 1, bonus: 8 },
  ],
  freshness: [
    { threshold: 1, bonus: 10 },
    { threshold: 7, bonus: 8 },
    { threshold: 30, bonus: 5 },
    { threshold: 90, bonus: 3 },
    { threshold: 365, bonus: 1 },
  ],
  quality: {
    uhd: 30,
    fullhd: 25,
    hd: 15,
    sd: 5,
    unknown: 0,
  },
  source: {
    remux: 15,
    bluray: 12,
    webdl: 10,
    webrip: 7,
    hdtv: 5,
    telesync: -20,
    cam: -40,
    unknown: 0,
  },
  hdr: {
    "DV-HDR10": 13,
    DV: 12,
    "HDR10+": 10,
    HDR10: 8,
    HDR: 8,
    HLG: 3,
  },
  audioCodec: {
    "TrueHD Atmos": 10,
    "DTS-HD MA": 9,
    TrueHD: 8,
    "DTS-HD": 7,
    DTS: 5,
    FLAC: 4,
    EAC3: 3,
    AC3: 2,
    AAC: 1,
  },
  audioChannels: {
    "7.1": 3,
    "5.1": 2,
    "2.0": 0,
    "1.0": 0,
  },
  groupTier: {
    gold: 12,
    neutral: 0,
    avoid: -40,
  },
  codec: {
    byQuality: {
      uhd: { h265: 12, av1: 10, h264: 4 },
      // H.265 at 1080p/720p earns nothing — TRaSH treats it as a re-encode
      // signal. The implicit gap to H.264 (+10) is the prefer-x264 cue.
      default: { h264: 10, av1: 8 },
    },
  },
  languageBonuses: {},
  streamingServiceBonuses: {
    NF: 1,
    AMZN: 1,
    ATVP: 1,
    DSNP: 1,
    HMAX: 1,
    HULU: 1,
    PCOK: 1,
    STAN: 1,
    PMTP: 1,
    CR: 1,
  },
  editionBonuses: {},
  flags: {
    exclusive: [
      { flag: "freeleech", bonus: 5 },
      { flag: "freeleech75", bonus: 4 },
      { flag: "halfleech", bonus: 3 },
      { flag: "freeleech25", bonus: 2 },
    ],
    additive: {
      doubleupload: 2,
      nuked: -100,
    },
  },
  multiAudioToken: 2,
  multipleLanguagesBonus: 1,
  hybridBonus: 3,
  repackPerCount: 3,
  repackMaxBonus: 6,
  comboUhdRemuxDvAtmos: 5,
  uhdNoHdrPenalty: -10,
  camWithDigitalPenalty: -80,
  camNoDigitalPenalty: -15,
  maxRaw: 170,
};

/**
 * Type-safe per-key merge for the dictionary-shaped rule fields.
 * Phase 2/Phase 5 layer user prefs and quality-profile overrides on top
 * of defaults using these helpers so the override only needs to specify
 * the keys it wants to change.
 *
 *   const rules = {
 *     ...DEFAULT_SCORING_RULES,
 *     streamingServiceBonuses: mergeRecord(
 *       DEFAULT_SCORING_RULES.streamingServiceBonuses,
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
