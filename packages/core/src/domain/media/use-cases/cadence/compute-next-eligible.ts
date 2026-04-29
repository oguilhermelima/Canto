import type { Aspect } from "../ensure-media.types";
import type { CadenceKnobs } from "./cadence-knobs";

/**
 * Outcomes recorded against a `media_aspect_state` row. Mirrors the
 * `outcome` column of the table.
 *
 *  - `data`: provider returned a usable payload, the row is healthy.
 *  - `partial`: provider returned a payload but it was missing required pieces
 *    (e.g. structure with no episodes for the latest season).
 *  - `empty`: provider has no data for this aspect — long cooldown.
 *  - `error_4xx`: provider rejected the request; permanent after the cap.
 *  - `error_5xx`: provider failed temporarily; exponential backoff.
 */
export type Outcome = "data" | "partial" | "empty" | "error_4xx" | "error_5xx";

export interface MediaContext {
  type: "movie" | "show";
  releaseDate: Date | null;
  nextEpisodeAirAt: Date | null;
}

export interface AspectStateInput {
  aspect: Aspect;
  consecutive_fails: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;
const TWENTY_FOUR_HOURS_MIN = 24 * 60;
/** Sentinel "permanent skip" used for permanently-failing 4xx rows. */
const PARKED_FOREVER = new Date("2099-01-01T00:00:00.000Z");

/**
 * Compute the next eligible time for an aspect row given the latest outcome
 * and the media context. Pure — no I/O, no clock access. Caller passes `now`.
 *
 * Behaviour summary:
 *  - `empty`            → `now + emptyOutcomeCooldownDays`
 *  - `error_4xx`        → `2099-01-01` once `consecutive_fails >= http4xxMaxAttempts`,
 *                          otherwise `now + 1 day` (cheap retry on the next sweep)
 *  - `error_5xx`        → `now + min(2^consecutive_fails * baseBackoffMin, 24h)` minutes
 *  - `data` / `partial` → per-(type, aspect) cadence (see `dataNextEligible`)
 *
 * `partial` is treated identically to `data` for now; we may halve the freq
 * later once we have a real signal of how often partials recover.
 */
export function computeNextEligible(
  row: AspectStateInput,
  outcome: Outcome,
  ctx: MediaContext,
  knobs: CadenceKnobs,
  now: Date,
): Date {
  switch (outcome) {
    case "empty":
      return addDays(now, knobs.emptyOutcomeCooldownDays);
    case "error_4xx":
      if (row.consecutive_fails >= knobs.http4xxMaxAttempts) {
        return PARKED_FOREVER;
      }
      return addDays(now, 1);
    case "error_5xx": {
      const exponent = Math.max(0, row.consecutive_fails);
      const minutes = Math.min(
        2 ** exponent * knobs.http5xxBaseBackoffMin,
        TWENTY_FOUR_HOURS_MIN,
      );
      return new Date(now.getTime() + minutes * ONE_MIN_MS);
    }
    case "data":
    case "partial":
      // TODO: differentiate `partial` (e.g. half the freq) once we have data
      // on how often partials recover vs. drift further. For now we treat
      // them identically so the engine has a single, predictable schedule.
      return dataNextEligible(row.aspect, ctx, knobs, now);
  }
}

/**
 * Per-(type, aspect) cadence for healthy rows. Defaults to
 * `showFallbackFreqDays` for any combo we have not yet specialised so that
 * the engine still makes forward progress on new aspects without code edits.
 */
function dataNextEligible(
  aspect: Aspect,
  ctx: MediaContext,
  knobs: CadenceKnobs,
  now: Date,
): Date {
  if (ctx.type === "movie" && (aspect === "metadata" || aspect === "extras")) {
    if (isMovieFresh(ctx.releaseDate, knobs.movieFreshWindowMonths, now)) {
      return addDays(now, knobs.movieFreshFreqDays);
    }
    return addDays(now, knobs.movieAgedFreqDays);
  }

  if (
    ctx.type === "show" &&
    (aspect === "metadata" || aspect === "extras" || aspect === "structure")
  ) {
    if (ctx.nextEpisodeAirAt) return new Date(ctx.nextEpisodeAirAt.getTime());
    return addDays(now, knobs.showFallbackFreqDays);
  }

  // Generic fallback for combos we haven't specialised yet (e.g. logos,
  // contentRatings, translations). Specialise as we collect signal.
  return addDays(now, knobs.showFallbackFreqDays);
}

/**
 * A movie is "fresh" when its release sits within `monthsWindow` of `now`,
 * looking both ways: pre-release titles count as fresh because we expect
 * heavy churn until launch. A null release date is treated as fresh — better
 * to refresh too often than miss new metadata for unscheduled titles.
 */
function isMovieFresh(
  releaseDate: Date | null,
  monthsWindow: number,
  now: Date,
): boolean {
  if (!releaseDate) return true;
  const windowMs = monthsWindow * 30 * ONE_DAY_MS;
  const delta = Math.abs(releaseDate.getTime() - now.getTime());
  return delta <= windowMs;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * ONE_DAY_MS);
}
