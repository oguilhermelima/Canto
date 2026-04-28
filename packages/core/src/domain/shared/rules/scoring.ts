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
 * Confidence engine. Pure function over `(attrs, ctx, rules)`.
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
export function calculateConfidence(
  attrs: ReleaseAttributes,
  ctx: ConfidenceContext,
  rules: ScoringRules,
): number {
  if (attrs.seeders === 0) return 0;

  let score = 0;

  // Health
  for (const tier of rules.health) {
    if (attrs.seeders >= tier.threshold) {
      score += tier.bonus;
      break;
    }
  }

  // Format scoring — quality + source. Two modes:
  //  • allowedFormats whitelist (Phase 5 download profile): the (quality,
  //    source) combo must appear in the list, otherwise reject. Earns
  //    the entry's joint weight.
  //  • per-axis fallback (no profile): independent quality + source
  //    lookups, summed.
  if (rules.allowedFormats) {
    const entry = rules.allowedFormats.find(
      (f) => f.quality === attrs.quality && f.source === attrs.source,
    );
    if (!entry) return 0;
    score += entry.weight;
  } else {
    score += rules.quality[attrs.quality] ?? 0;
    score += rules.source[attrs.source] ?? 0;
  }

  // Codec — context-aware on quality, with `default` fallback
  const codecTable =
    rules.codec.byQuality[attrs.quality] ?? rules.codec.byQuality.default;
  if (attrs.codec) score += codecTable[attrs.codec] ?? 0;

  // HDR
  if (attrs.hdrFormat) score += rules.hdr[attrs.hdrFormat] ?? 0;

  // UHD-without-HDR penalty
  if (attrs.quality === "uhd" && !attrs.hdrFormat) {
    score += rules.uhdNoHdrPenalty;
  }

  // Audio codec
  if (attrs.audioCodec) score += rules.audioCodec[attrs.audioCodec] ?? 0;

  // Audio channels
  if (attrs.audioChannels) {
    score += rules.audioChannels[attrs.audioChannels] ?? 0;
  }

  // Multi-audio: explicit token wins over the multi-language fallback so we
  // never reward the same release twice.
  if (attrs.hasMultiAudioToken) {
    score += rules.multiAudioToken;
  } else if (attrs.distinctLanguageCount >= 2) {
    score += rules.multipleLanguagesBonus;
  }

  // Per-language bonuses (from user prefs / profile overrides)
  for (const lang of attrs.languages) {
    const lb = rules.languageBonuses[lang];
    if (lb) score += lb;
  }

  // Streaming service
  if (attrs.streamingService) {
    score += rules.streamingServiceBonuses[attrs.streamingService] ?? 0;
  }

  // Edition
  if (attrs.edition) {
    score += rules.editionBonuses[attrs.edition] ?? 0;
  }

  // Freshness
  for (const tier of rules.freshness) {
    if (attrs.age <= tier.threshold) {
      score += tier.bonus;
      break;
    }
  }

  // Release group tier
  score += rules.groupTier[attrs.groupTier] ?? 0;

  // Repack / Proper
  if (attrs.repackCount > 0) {
    score += Math.min(
      rules.repackMaxBonus,
      attrs.repackCount * rules.repackPerCount,
    );
  }

  // Hybrid
  if (attrs.isHybrid) score += rules.hybridBonus;

  // Combo jackpot
  if (
    attrs.quality === "uhd" &&
    attrs.source === "remux" &&
    (attrs.hdrFormat === "DV-HDR10" || attrs.hdrFormat === "DV") &&
    attrs.audioCodec === "TrueHD Atmos"
  ) {
    score += rules.comboUhdRemuxDvAtmos;
  }

  // Indexer flags — mutually-exclusive (first match) + additive
  const lowerFlags = new Set(attrs.flags.map((f) => f.toLowerCase()));
  for (const exclusive of rules.flags.exclusive) {
    if (lowerFlags.has(exclusive.flag)) {
      score += exclusive.bonus;
      break;
    }
  }
  for (const flag of lowerFlags) {
    const bonus = rules.flags.additive[flag];
    if (bonus) score += bonus;
  }

  // CAM keyword penalty (separate from `source: cam` — we trust both)
  if (attrs.isCam) {
    score += ctx.hasDigitalRelease
      ? rules.camWithDigitalPenalty
      : rules.camNoDigitalPenalty;
  }

  // Normalise to 0–100
  const normalized = Math.round((score / rules.maxRaw) * 100);
  const clamped = Math.max(0, Math.min(100, normalized));

  // Final-cut threshold (used by Phase 5 profiles to drop sub-quality
  // releases before they ever reach the UI).
  if (clamped < rules.minTotalScore) return 0;
  return clamped;
}
