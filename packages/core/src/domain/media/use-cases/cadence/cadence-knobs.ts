import { getSettings } from "@canto/db/settings";
import type { Database } from "@canto/db/client";

/**
 * Tunable parameters for the enrichment cadence engine.
 *
 * Every value has a sensible default in `DEFAULT_KNOBS`. Operators can
 * override individual values via `system_setting` rows whose keys live in the
 * settings registry under the `cadence.*` prefix.
 *
 * The cadence functions in this folder treat knobs as immutable inputs — load
 * once at the top of an orchestration via `loadCadenceKnobs(db)` and pass the
 * resolved struct down. Pure functions never reach back to the DB.
 */
export interface CadenceKnobs {
  /** How long to wait after an `empty` outcome before re-trying. */
  emptyOutcomeCooldownDays: number;
  /** Hard cap on consecutive 4xx attempts before parking the row in 2099. */
  http4xxMaxAttempts: number;
  /** Base minutes for the 5xx exponential backoff (capped at 24h). */
  http5xxBaseBackoffMin: number;
  /** Window (months from release) where movies are still considered "fresh". */
  movieFreshWindowMonths: number;
  /** Refresh frequency (days) for fresh movies. */
  movieFreshFreqDays: number;
  /** Refresh frequency (days) for aged movies. */
  movieAgedFreqDays: number;
  /**
   * Generic show-side fallback frequency (days) for situations where the
   * cadence engine has no better signal — e.g. structure with no scheduled
   * next-episode date, or non-movie aspects we have not yet specialised.
   */
  showFallbackFreqDays: number;
}

export const DEFAULT_KNOBS: CadenceKnobs = {
  emptyOutcomeCooldownDays: 90,
  http4xxMaxAttempts: 3,
  http5xxBaseBackoffMin: 5,
  movieFreshWindowMonths: 6,
  movieFreshFreqDays: 30,
  movieAgedFreqDays: 365,
  showFallbackFreqDays: 7,
};

const KEYS = [
  "cadence.emptyOutcomeCooldownDays",
  "cadence.http4xxMaxAttempts",
  "cadence.http5xxBaseBackoffMin",
  "cadence.movieFreshWindowMonths",
  "cadence.movieFreshFreqDays",
  "cadence.movieAgedFreqDays",
  "cadence.showFallbackFreqDays",
] as const;

/**
 * Load the cadence knobs from the settings registry, falling back to
 * `DEFAULT_KNOBS` for any key that is unset. The DB read is the only side
 * effect on this module — every other cadence function is pure.
 */
export async function loadCadenceKnobs(db: Database): Promise<CadenceKnobs> {
  // `db` is unused — the settings module reads via an ambient import. Accepted
  // here so callers wire DI consistently with the rest of the use-cases.
  void db;
  const values = await getSettings(KEYS);
  return {
    emptyOutcomeCooldownDays:
      values["cadence.emptyOutcomeCooldownDays"] ??
      DEFAULT_KNOBS.emptyOutcomeCooldownDays,
    http4xxMaxAttempts:
      values["cadence.http4xxMaxAttempts"] ?? DEFAULT_KNOBS.http4xxMaxAttempts,
    http5xxBaseBackoffMin:
      values["cadence.http5xxBaseBackoffMin"] ??
      DEFAULT_KNOBS.http5xxBaseBackoffMin,
    movieFreshWindowMonths:
      values["cadence.movieFreshWindowMonths"] ??
      DEFAULT_KNOBS.movieFreshWindowMonths,
    movieFreshFreqDays:
      values["cadence.movieFreshFreqDays"] ?? DEFAULT_KNOBS.movieFreshFreqDays,
    movieAgedFreqDays:
      values["cadence.movieAgedFreqDays"] ?? DEFAULT_KNOBS.movieAgedFreqDays,
    showFallbackFreqDays:
      values["cadence.showFallbackFreqDays"] ??
      DEFAULT_KNOBS.showFallbackFreqDays,
  };
}
