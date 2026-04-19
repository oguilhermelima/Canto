/**
 * Unified "ensure this media is complete" engine.
 *
 * One entry point (`ensureMedia`) that covers every provider-sourced data
 * shape: base metadata, structure (seasons/episodes), per-language overlays
 * (translations, posters, logos), and extras (credits/videos/recs/providers).
 *
 * Callers declare WHAT they need; the engine figures out HOW with the minimum
 * set of TMDB/TVDB calls.
 */

/** The different categories of data that can be ensured. */
export type Aspect =
  | "metadata"       // base fields on media/season/episode (EN canonical)
  | "structure"      // seasons + episodes scaffolding (usually TVDB-driven)
  | "translations"   // media/season/episode_translation rows (title/overview/tagline/posterPath)
  | "logos"          // per-lang logoPath via TMDB /images
  | "extras";        // credits, videos, recommendations, watch providers

export const ALL_ASPECTS: Aspect[] = [
  "metadata",
  "structure",
  "translations",
  "logos",
  "extras",
];

export interface EnsureMediaSpec {
  /** Target languages. Default: `getActiveUserLanguages()`. */
  languages?: string[];
  /** Aspects to ensure. Default: auto-detect via `detectGaps()`. */
  aspects?: Aspect[];
  /** Bypass freshness TTL and missing-only checks. Default: false. */
  force?: boolean;
}

/** Summary of what's missing for a given media + language set. */
export interface GapReport {
  mediaId: string;
  languages: string[];
  gaps: Aspect[];
  details: {
    metadataStale: boolean;
    structureMissing: boolean;
    translationsMissingByLang: Record<
      string,
      { media: boolean; seasons: number; episodes: number }
    >;
    logosMissingByLang: string[];
    extrasStale: boolean;
  };
}

export interface EnsureMediaResult {
  mediaId: string;
  aspectsExecuted: Aspect[];
  languagesProcessed: string[];
  providerCalls: { tmdb: number; tvdb: number };
  writes: {
    media: boolean;
    structureSeasons: number;
    structureEpisodes: number;
    translationsMedia: number;
    translationsSeason: number;
    translationsEpisode: number;
    logos: number;
    extras: number;
  };
  /** Aspects that were requested/detected but skipped (with reason). */
  skipped: Partial<Record<Aspect, string>>;
  durationMs: number;
}

/** Staleness thresholds. Only `metadata` and `extras` expire. */
export const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const EXTRAS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
