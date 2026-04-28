import type { ConfidenceContext } from "../../torrents/types/common";
import type { ReleaseAttributes } from "../../torrents/rules/release-attributes";
import type { ScoringRules } from "./scoring-rules";

export {
  EMPTY_ADMIN_DOWNLOAD_POLICY,
  EMPTY_DOWNLOAD_PREFERENCES,
  applyAdminDownloadPolicy,
  applyDownloadPreferences,
  mergeRecord,
} from "./scoring-rules";
export type {
  AdminDownloadPolicy,
  Av1Stance,
  DownloadPreferences,
  ScoringRules,
} from "./scoring-rules";

/**
 * One contribution to a release's confidence score. The label/detail
 * pair is what the explainability tooltip in the UI renders, so they
 * should read like sentences a human would write — "Quality: UHD",
 * "Group tier: tier1", not the raw rule keys.
 */
export interface ScoreComponent {
  label: string;
  /** Signed raw points. Positive = bonus, negative = penalty. */
  points: number;
  /** Optional sub-label, e.g. the matched audio codec or HDR format. */
  detail?: string;
}

export interface ConfidenceBreakdown {
  /** Final 0–100 score after normalisation, threshold and clamping. */
  score: number;
  /** Sum of all component points before normalisation. */
  raw: number;
  /** `rules.maxRaw` at score time — useful for "raw / max" displays. */
  maxRaw: number;
  /** Per-rule contributions, in the order the engine applied them.
   *  Components with `points: 0` are kept in the list when the engine
   *  read them (e.g. "Audio channels: 2.0 (+0)"); rules that didn't
   *  apply at all are omitted. */
  components: ScoreComponent[];
  /** True when a hard rule (allowedFormats whitelist, dead-torrent
   *  guard, minTotalScore filter, language gate) drove the score to 0. */
  rejected: boolean;
  rejectReason?:
    | "no-seeders"
    | "format-not-allowed"
    | "below-min-score"
    | "language-not-matched";
}

/**
 * Explainable confidence engine. Pure function over
 * `(attrs, ctx, rules)` that returns both the final score and the
 * per-component breakdown. {@link calculateConfidence} is a thin
 * wrapper that drops the breakdown.
 *
 * Component hierarchy (max raw 170 with default rules):
 *
 *   Health (0–40)            tiered by seeder count, dead-torrent guard
 *   Quality (0–30)           UHD > FullHD > HD > SD
 *   Source (−40 to +15)      Remux > BluRay > WEB-DL > … > Telesync > CAM
 *   Codec (0–12)             context-aware via `rules.codec.byQuality`;
 *                            H.265 only rewarded at UHD (TRaSH treats
 *                            x265 at 1080p/720p as a re-encode signal)
 *   HDR (0–13)               DV-HDR10 > DV > HDR10+ > HDR10 ≈ HDR > HLG.
 *                            UHD without HDR is penalised (`uhdNoHdrPenalty`)
 *                            since 4K SDR doesn't justify its bandwidth.
 *   Audio codec (0–10)       TrueHD Atmos > DTS-HD MA > … > AAC
 *   Audio channels (0–3)     7.1 > 5.1 > 2.0
 *   Languages (0–N)          Σ rules.languageBonuses[lang] for matching
 *                            languages, plus a multi-audio-token bonus or
 *                            multiple-languages fallback.
 *   Streaming service (0–N)  rules.streamingServiceBonuses[svc].
 *   Edition (signed)         rules.editionBonuses[edition] (negative when
 *                            avoided, positive when preferred).
 *   Freshness (0–10)         tiered by age in days
 *   Group tier (−40 to +12)  HQ groups boosted; LQ groups buried
 *   Repack/Proper (0–6)      capped, scaled by repack count
 *   Hybrid (0–3)             best-of-both BluRay+WEB
 *   Combo bonus (0–5)        UHD Remux + DV/DV-HDR10 + Atmos jackpot
 *   Indexer flags            mutually-exclusive (freeleech tiers) +
 *                            additive (doubleupload / nuked)
 *
 * Penalties (additive, can drive raw score below 0):
 *   CAM keywords: `camWithDigitalPenalty` if a digital release should
 *                 exist, otherwise `camNoDigitalPenalty`.
 *   Nuked flag:   `flags.additive.nuked`.
 */
export function explainConfidence(
  attrs: ReleaseAttributes,
  ctx: ConfidenceContext,
  rules: ScoringRules,
): ConfidenceBreakdown {
  const components: ScoreComponent[] = [];
  const push = (
    label: string,
    points: number,
    detail?: string,
  ): void => {
    if (points === 0 && !detail) return;
    components.push({ label, points, ...(detail !== undefined ? { detail } : {}) });
  };

  if (attrs.seeders === 0) {
    return {
      score: 0,
      raw: 0,
      maxRaw: rules.maxRaw,
      components: [{ label: "Health", points: 0, detail: "no seeders" }],
      rejected: true,
      rejectReason: "no-seeders",
    };
  }

  let score = 0;

  // Health
  for (const tier of rules.health) {
    if (attrs.seeders >= tier.threshold) {
      score += tier.bonus;
      push("Health", tier.bonus, `${attrs.seeders} seeders`);
      break;
    }
  }

  // Format scoring — quality + source. Two modes:
  //  • allowedFormats whitelist (download profile): the (quality,
  //    source) combo must appear in the list, otherwise reject. Earns
  //    the entry's joint weight.
  //  • per-axis fallback (no profile): independent quality + source
  //    lookups, summed.
  if (rules.requiredLanguages && rules.requiredLanguages.length > 0) {
    const required = new Set(rules.requiredLanguages);
    const matched = attrs.languages.some((l) => required.has(l));
    if (!matched) {
      return {
        score: 0,
        raw: 0,
        maxRaw: rules.maxRaw,
        components: [
          ...components,
          {
            label: "Language",
            points: 0,
            detail: `none of ${rules.requiredLanguages.join(", ")} matched`,
          },
        ],
        rejected: true,
        rejectReason: "language-not-matched",
      };
    }
  }

  if (rules.allowedFormats) {
    const entry = rules.allowedFormats.find(
      (f) => f.quality === attrs.quality && f.source === attrs.source,
    );
    if (!entry) {
      return {
        score: 0,
        raw: 0,
        maxRaw: rules.maxRaw,
        components: [
          ...components,
          {
            label: "Profile",
            points: 0,
            detail: `${attrs.quality} ${attrs.source} not in profile`,
          },
        ],
        rejected: true,
        rejectReason: "format-not-allowed",
      };
    }
    score += entry.weight;
    push("Profile match", entry.weight, `${attrs.quality} ${attrs.source}`);
  } else {
    const q = rules.quality[attrs.quality] ?? 0;
    score += q;
    push("Quality", q, attrs.quality);
    const s = rules.source[attrs.source] ?? 0;
    score += s;
    push("Source", s, attrs.source);
  }

  // Codec — context-aware on quality, with `default` fallback
  if (attrs.codec) {
    const codecTable =
      rules.codec.byQuality[attrs.quality] ?? rules.codec.byQuality.default;
    const c = codecTable[attrs.codec] ?? 0;
    score += c;
    push("Codec", c, attrs.codec);
  }

  // HDR
  if (attrs.hdrFormat) {
    const h = rules.hdr[attrs.hdrFormat] ?? 0;
    score += h;
    push("HDR", h, attrs.hdrFormat);
  }

  // UHD-without-HDR penalty
  if (attrs.quality === "uhd" && !attrs.hdrFormat) {
    score += rules.uhdNoHdrPenalty;
    push("UHD without HDR", rules.uhdNoHdrPenalty, "penalty");
  }

  // Audio codec
  if (attrs.audioCodec) {
    const a = rules.audioCodec[attrs.audioCodec] ?? 0;
    score += a;
    push("Audio codec", a, attrs.audioCodec);
  }

  // Audio channels
  if (attrs.audioChannels) {
    const ch = rules.audioChannels[attrs.audioChannels] ?? 0;
    score += ch;
    push("Audio channels", ch, attrs.audioChannels);
  }

  // Multi-audio: explicit token wins over the multi-language fallback so we
  // never reward the same release twice.
  if (attrs.hasMultiAudioToken) {
    score += rules.multiAudioToken;
    push("Multi-audio", rules.multiAudioToken, "MULTi/DUAL");
  } else if (attrs.distinctLanguageCount >= 2) {
    score += rules.multipleLanguagesBonus;
    push(
      "Multiple languages",
      rules.multipleLanguagesBonus,
      `${attrs.distinctLanguageCount} languages`,
    );
  }

  // Per-language bonuses (from user prefs / profile overrides)
  let langTotal = 0;
  const matchedLangs: string[] = [];
  for (const lang of attrs.languages) {
    const lb = rules.languageBonuses[lang];
    if (lb) {
      langTotal += lb;
      matchedLangs.push(lang);
    }
  }
  if (langTotal !== 0) {
    score += langTotal;
    push("Preferred languages", langTotal, matchedLangs.join(", "));
  }

  // Streaming service
  if (attrs.streamingService) {
    const ss = rules.streamingServiceBonuses[attrs.streamingService] ?? 0;
    if (ss !== 0) {
      score += ss;
      push("Streaming service", ss, attrs.streamingService);
    }
  }

  // Edition
  if (attrs.edition) {
    const ed = rules.editionBonuses[attrs.edition] ?? 0;
    if (ed !== 0) {
      score += ed;
      push("Edition", ed, attrs.edition);
    }
  }

  // Freshness
  for (const tier of rules.freshness) {
    if (attrs.age <= tier.threshold) {
      score += tier.bonus;
      push("Freshness", tier.bonus, `≤${tier.threshold}d`);
      break;
    }
  }

  // Release group tier
  const gt = rules.groupTier[attrs.groupTier] ?? 0;
  if (gt !== 0 || attrs.releaseGroup) {
    score += gt;
    push("Group tier", gt, `${attrs.groupTier}${attrs.releaseGroup ? `: ${attrs.releaseGroup}` : ""}`);
  }

  // Repack / Proper
  if (attrs.repackCount > 0) {
    const repack = Math.min(
      rules.repackMaxBonus,
      attrs.repackCount * rules.repackPerCount,
    );
    score += repack;
    push("Repack/Proper", repack, `count ${attrs.repackCount}`);
  }

  // Hybrid
  if (attrs.isHybrid) {
    score += rules.hybridBonus;
    push("Hybrid", rules.hybridBonus, "BluRay+WEB");
  }

  // Combo jackpot
  if (
    attrs.quality === "uhd" &&
    attrs.source === "remux" &&
    (attrs.hdrFormat === "DV-HDR10" || attrs.hdrFormat === "DV") &&
    attrs.audioCodec === "TrueHD Atmos"
  ) {
    score += rules.comboUhdRemuxDvAtmos;
    push("Combo jackpot", rules.comboUhdRemuxDvAtmos, "UHD Remux DV Atmos");
  }

  // Indexer flags — mutually-exclusive (first match) + additive
  const lowerFlags = new Set(attrs.flags.map((f) => f.toLowerCase()));
  for (const exclusive of rules.flags.exclusive) {
    if (lowerFlags.has(exclusive.flag)) {
      score += exclusive.bonus;
      push("Indexer flag", exclusive.bonus, exclusive.flag);
      break;
    }
  }
  for (const flag of lowerFlags) {
    const bonus = rules.flags.additive[flag];
    if (bonus) {
      score += bonus;
      push("Indexer flag", bonus, flag);
    }
  }

  // CAM keyword penalty (separate from `source: cam` — we trust both)
  if (attrs.isCam) {
    const camPenalty = ctx.hasDigitalRelease
      ? rules.camWithDigitalPenalty
      : rules.camNoDigitalPenalty;
    score += camPenalty;
    push("CAM keyword", camPenalty, ctx.hasDigitalRelease ? "digital available" : "no digital");
  }

  // Normalise to 0–100
  const normalized = Math.round((score / rules.maxRaw) * 100);
  const clamped = Math.max(0, Math.min(100, normalized));

  // Final-cut threshold (used by download profiles to drop sub-quality
  // releases before they ever reach the UI).
  if (clamped < rules.minTotalScore) {
    return {
      score: 0,
      raw: score,
      maxRaw: rules.maxRaw,
      components,
      rejected: true,
      rejectReason: "below-min-score",
    };
  }

  return {
    score: clamped,
    raw: score,
    maxRaw: rules.maxRaw,
    components,
    rejected: false,
  };
}

/**
 * Confidence engine — returns just the 0–100 score. Thin wrapper over
 * {@link explainConfidence} so callers that don't need the breakdown
 * (cron jobs, regression tests) stay untouched.
 */
export function calculateConfidence(
  attrs: ReleaseAttributes,
  ctx: ConfidenceContext,
  rules: ScoringRules,
): number {
  return explainConfidence(attrs, ctx, rules).score;
}
