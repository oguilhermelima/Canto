import { describe, expect, it } from "vitest";

import type { Aspect } from "@canto/core/domain/media/types/media-aspect-state";
import { DEFAULT_KNOBS } from "@canto/core/domain/media/use-cases/cadence/cadence-knobs";
import {
  computeNextEligible,
  type AspectStateInput,
  type MediaContext,
  type Outcome,
} from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";

const NOW = new Date("2026-04-01T00:00:00.000Z");

function row(aspect: Aspect, fails = 0): AspectStateInput {
  return { aspect, consecutive_fails: fails };
}

function ctx(overrides: Partial<MediaContext> = {}): MediaContext {
  return {
    type: "movie",
    releaseDate: null,
    nextEpisodeAirAt: null,
    ...overrides,
  };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(d: Date): number {
  return Math.round((d.getTime() - NOW.getTime()) / ONE_DAY_MS);
}

function minutesFromNow(d: Date): number {
  return Math.round((d.getTime() - NOW.getTime()) / 60_000);
}

describe("computeNextEligible — movie data outcomes", () => {
  it("returns 30 days for a fresh movie (release within window)", () => {
    const releaseDate = new Date("2026-03-01T00:00:00.000Z"); // 1 month ago
    const result = computeNextEligible(
      row("metadata"),
      "data",
      ctx({ type: "movie", releaseDate }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(daysFromNow(result)).toBe(DEFAULT_KNOBS.movieFreshFreqDays);
  });

  it("returns 365 days for an aged movie (release outside window)", () => {
    const releaseDate = new Date("2010-01-01T00:00:00.000Z");
    const result = computeNextEligible(
      row("metadata"),
      "data",
      ctx({ type: "movie", releaseDate }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(daysFromNow(result)).toBe(DEFAULT_KNOBS.movieAgedFreqDays);
  });

  it("treats null releaseDate as fresh (uses fresh frequency)", () => {
    const result = computeNextEligible(
      row("metadata"),
      "data",
      ctx({ type: "movie", releaseDate: null }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(daysFromNow(result)).toBe(DEFAULT_KNOBS.movieFreshFreqDays);
  });
});

describe("computeNextEligible — show data outcomes", () => {
  it("returns nextEpisodeAirAt when set for show + structure + data", () => {
    const next = new Date("2026-05-15T18:00:00.000Z");
    const result = computeNextEligible(
      row("structure"),
      "data",
      ctx({ type: "show", nextEpisodeAirAt: next }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(result.toISOString()).toBe(next.toISOString());
  });

  it("falls back to showFallbackFreqDays when nextEpisodeAirAt is null", () => {
    const result = computeNextEligible(
      row("structure"),
      "data",
      ctx({ type: "show", nextEpisodeAirAt: null }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(daysFromNow(result)).toBe(DEFAULT_KNOBS.showFallbackFreqDays);
  });
});

describe("computeNextEligible — non-data outcomes", () => {
  const aspects: Aspect[] = ["metadata", "structure", "extras", "logos"];

  it.each(aspects)("'empty' parks %s for emptyOutcomeCooldownDays", (a) => {
    const result = computeNextEligible(
      row(a),
      "empty" satisfies Outcome,
      ctx({ type: "show" }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(daysFromNow(result)).toBe(DEFAULT_KNOBS.emptyOutcomeCooldownDays);
  });

  it("'error_4xx' with consecutive_fails >= max parks the row at 2099-01-01", () => {
    const result = computeNextEligible(
      row("metadata", 3),
      "error_4xx",
      ctx(),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(result.toISOString().startsWith("2099-01-01")).toBe(true);
  });

  it("'error_4xx' below the cap retries the next day", () => {
    const result = computeNextEligible(
      row("metadata", 1),
      "error_4xx",
      ctx(),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(daysFromNow(result)).toBe(1);
  });

  it("'error_5xx' caps the exponential backoff at 24 hours", () => {
    const result = computeNextEligible(
      row("metadata", 10),
      "error_5xx",
      ctx(),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(minutesFromNow(result)).toBe(24 * 60);
  });

  it("'error_5xx' grows exponentially below the 24h cap", () => {
    const result = computeNextEligible(
      row("metadata", 2),
      "error_5xx",
      ctx(),
      DEFAULT_KNOBS,
      NOW,
    );
    // 2^2 * 5 = 20 minutes
    expect(minutesFromNow(result)).toBe(2 ** 2 * DEFAULT_KNOBS.http5xxBaseBackoffMin);
  });

  it("'partial' is currently treated like 'data'", () => {
    const releaseDate = new Date("2026-03-15T00:00:00.000Z");
    const data = computeNextEligible(
      row("metadata"),
      "data",
      ctx({ type: "movie", releaseDate }),
      DEFAULT_KNOBS,
      NOW,
    );
    const partial = computeNextEligible(
      row("metadata"),
      "partial",
      ctx({ type: "movie", releaseDate }),
      DEFAULT_KNOBS,
      NOW,
    );
    expect(partial.toISOString()).toBe(data.toISOString());
  });
});
