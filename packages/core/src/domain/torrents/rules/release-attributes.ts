import type { Quality, Source } from "../types/common";
import { detectQuality, detectSource } from "./quality";
import {
  detectAudioChannels,
  detectAudioCodec,
  detectCodec,
  detectEdition,
  detectHdrFormat,
  detectReleaseGroup,
  detectRepackCount,
  detectStreamingService,
  isHybridRelease,
} from "./parsing-release";
import { detectLanguages } from "./parsing-languages";
import {
  classifyReleaseGroup,
  type ReleaseGroupTier,
} from "./release-groups";

/**
 * CAM / Telesync keywords that survive in indexer titles even when the
 * release is mis-labelled. Used to apply a heavy penalty separately from
 * the source detector — sometimes an "HDTV" release is actually a CAM
 * snuck in under the wrong tag, and the keyword scan is the safety net.
 */
const CAM_KEYWORDS = [
  "cam",
  "camrip",
  "bdscr",
  "ddc",
  "dvdscreener",
  "dvdscr",
  "hdcam",
  "hdtc",
  "hdts",
  "scr",
  "screener",
  "telesync",
  "ts",
  "webscreener",
  "tc",
  "telecine",
  "tvrip",
];

const CAM_KEYWORD_PATTERN = new RegExp(
  `\\b(?:${CAM_KEYWORDS.join("|")})\\b`,
  "i",
);

/** Set of language codes that carry no per-language meaning on their own. */
const LANGUAGE_META_TOKENS = new Set(["multi", "dual", "multi-subs"]);

/**
 * Release attributes feed both the scoring engine and the search-result
 * payload. Combines raw indexer signals (seeders, age, flags) with the
 * attributes derived from the title via the per-attribute detectors.
 */
export interface ReleaseAttributes {
  /** Raw release title — kept for downstream display + audit. */
  title: string;
  seeders: number;
  /** Age in days since publish. */
  age: number;
  /** Indexer flags as the indexer produced them. Lowercased before scoring. */
  flags: string[];

  quality: Quality;
  source: Source;
  codec: string | null;
  hdrFormat: string | null;
  audioCodec: string | null;
  audioChannels: string | null;
  edition: string | null;
  streamingService: string | null;
  releaseGroup: string | null;
  groupTier: ReleaseGroupTier;
  /** ISO codes from {@link detectLanguages}, including meta tokens. */
  languages: string[];
  /** True when MULTi or DUAL is present in the language set. */
  hasMultiAudioToken: boolean;
  /** Count of language codes that aren't meta tokens. */
  distinctLanguageCount: number;
  isHybrid: boolean;
  /** 0 if not a repack/proper/rerip; otherwise the count (REPACK2 → 2). */
  repackCount: number;
  /** True when a CAM/TS keyword survives in the title. */
  isCam: boolean;
}

export interface RawReleaseSignals {
  title: string;
  seeders: number;
  age: number;
  flags: string[];
}

/**
 * Compose every per-attribute detector into a single bag of derived
 * fields. Pure — no DB or network access. Idempotent for the same input.
 */
export function parseReleaseAttributes(
  raw: RawReleaseSignals,
): ReleaseAttributes {
  const { title, seeders, age, flags } = raw;
  const languages = detectLanguages(title);
  const releaseGroup = detectReleaseGroup(title);

  const distinctLanguageCount = languages.filter(
    (l) => !LANGUAGE_META_TOKENS.has(l),
  ).length;

  const hasMultiAudioToken =
    languages.includes("multi") || languages.includes("dual");

  return {
    title,
    seeders,
    age,
    flags,

    quality: detectQuality(title),
    source: detectSource(title),
    codec: detectCodec(title),
    hdrFormat: detectHdrFormat(title),
    audioCodec: detectAudioCodec(title),
    audioChannels: detectAudioChannels(title),
    edition: detectEdition(title),
    streamingService: detectStreamingService(title),
    releaseGroup,
    groupTier: classifyReleaseGroup(releaseGroup),
    languages,
    hasMultiAudioToken,
    distinctLanguageCount,
    isHybrid: isHybridRelease(title),
    repackCount: detectRepackCount(title),
    isCam: CAM_KEYWORD_PATTERN.test(title),
  };
}
