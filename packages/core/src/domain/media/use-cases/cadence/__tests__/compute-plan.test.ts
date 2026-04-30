import { describe, expect, it } from "vitest";

import type {
  Aspect,
  MediaAspectState,
} from "@canto/core/domain/media/types/media-aspect-state";
import { DEFAULT_KNOBS } from "@canto/core/domain/media/use-cases/cadence/cadence-knobs";
import {
  computePlan,
  type CadenceSignal,
  type ComputePlanInput,
} from "@canto/core/domain/media/use-cases/cadence/compute-plan";
import type { MediaContext } from "@canto/core/domain/media/use-cases/cadence/compute-next-eligible";

const NOW = new Date("2026-04-01T00:00:00.000Z");
const PAST = new Date("2026-03-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");

function makeRow(
  overrides: Partial<MediaAspectState> & { aspect: Aspect },
): MediaAspectState {
  const created = new Date("2026-01-01T00:00:00.000Z");
  return {
    mediaId: "media-1",
    aspect: overrides.aspect,
    scope: overrides.scope ?? "",
    lastAttemptAt: overrides.lastAttemptAt ?? created,
    succeededAt: overrides.succeededAt ?? created,
    outcome: overrides.outcome ?? "data",
    nextEligibleAt: overrides.nextEligibleAt ?? FUTURE,
    attempts: overrides.attempts ?? 1,
    consecutiveFails: overrides.consecutiveFails ?? 0,
    materializedSource: overrides.materializedSource ?? null,
    createdAt: overrides.createdAt ?? created,
    updatedAt: overrides.updatedAt ?? created,
  };
}

function input(
  overrides: Partial<ComputePlanInput> & { state: MediaAspectState[] },
): ComputePlanInput {
  const ctx: MediaContext = overrides.ctx ?? {
    type: "show",
    releaseDate: null,
    nextEpisodeAirAt: null,
  };
  return {
    state: overrides.state,
    ctx,
    signal: (overrides.signal ?? "visited") satisfies CadenceSignal,
    activeLanguages: overrides.activeLanguages ?? ["en-US"],
    effectiveProvider: overrides.effectiveProvider ?? "tmdb",
    forceAspects: overrides.forceAspects,
    knobs: overrides.knobs ?? DEFAULT_KNOBS,
    now: overrides.now ?? NOW,
  };
}

describe("computePlan — eligibility", () => {
  it("includes rows whose nextEligibleAt is in the past", () => {
    const plan = computePlan(
      input({
        state: [
          makeRow({ aspect: "metadata", nextEligibleAt: PAST }),
          makeRow({ aspect: "extras", nextEligibleAt: FUTURE }),
        ],
        activeLanguages: [],
      }),
    );
    expect(plan.items.map((i) => i.aspect)).toEqual(["metadata"]);
    expect(plan.items[0]?.force).toBeUndefined();
  });

  it("returns an empty plan when nothing is eligible (visited signal, all future)", () => {
    const plan = computePlan(
      input({
        signal: "visited",
        state: [makeRow({ aspect: "metadata", nextEligibleAt: FUTURE })],
        activeLanguages: [],
      }),
    );
    expect(plan.items).toEqual([]);
    expect(plan.reason).toBeUndefined();
  });
});

describe("computePlan — forced aspects", () => {
  it("forceAspects bypasses nextEligibleAt", () => {
    const plan = computePlan(
      input({
        state: [makeRow({ aspect: "metadata", nextEligibleAt: FUTURE })],
        forceAspects: [{ aspect: "metadata", scope: "" }],
      }),
    );
    expect(plan.items).toContainEqual({
      aspect: "metadata",
      scope: "",
      force: true,
    });
  });

  it("forced + due aspects are not duplicated", () => {
    const plan = computePlan(
      input({
        state: [makeRow({ aspect: "metadata", nextEligibleAt: PAST })],
        forceAspects: [{ aspect: "metadata", scope: "" }],
      }),
    );
    const metadataItems = plan.items.filter((i) => i.aspect === "metadata");
    expect(metadataItems).toHaveLength(1);
    expect(metadataItems[0]?.force).toBe(true);
  });
});

describe("computePlan — source migration", () => {
  it("forces structure + all active translations when materialized_source differs", () => {
    const plan = computePlan(
      input({
        state: [
          makeRow({
            aspect: "structure",
            scope: "",
            materializedSource: "tmdb",
            nextEligibleAt: FUTURE,
          }),
          makeRow({
            aspect: "translations",
            scope: "en-US",
            nextEligibleAt: FUTURE,
          }),
          makeRow({
            aspect: "translations",
            scope: "pt-BR",
            nextEligibleAt: FUTURE,
          }),
        ],
        activeLanguages: ["en-US", "pt-BR"],
        effectiveProvider: "tvdb",
      }),
    );

    expect(plan.reason).toBe("source-migration");
    expect(plan.items).toContainEqual({
      aspect: "structure",
      scope: "",
      force: true,
    });
    expect(plan.items).toContainEqual({
      aspect: "translations",
      scope: "en-US",
      force: true,
    });
    expect(plan.items).toContainEqual({
      aspect: "translations",
      scope: "pt-BR",
      force: true,
    });
  });

  it("does not flag migration when materialized_source matches the effective provider", () => {
    const plan = computePlan(
      input({
        state: [
          makeRow({
            aspect: "structure",
            materializedSource: "tmdb",
            nextEligibleAt: FUTURE,
          }),
        ],
        effectiveProvider: "tmdb",
        activeLanguages: [],
      }),
    );
    expect(plan.reason).toBeUndefined();
    expect(plan.items).toEqual([]);
  });
});

describe("computePlan — missing translations", () => {
  it("adds a forced translation item for an active language with no state row", () => {
    const plan = computePlan(
      input({
        state: [
          makeRow({
            aspect: "translations",
            scope: "en-US",
            nextEligibleAt: FUTURE,
          }),
        ],
        activeLanguages: ["en-US", "pt-BR"],
      }),
    );
    expect(plan.items).toContainEqual({
      aspect: "translations",
      scope: "pt-BR",
      force: true,
    });
    // en-US already has a (non-due) row → not added.
    expect(
      plan.items.filter(
        (i) => i.aspect === "translations" && i.scope === "en-US",
      ),
    ).toHaveLength(0);
  });
});

describe("computePlan — missing logos", () => {
  it("adds a forced logos item for a non-en active language with no state row", () => {
    const plan = computePlan(
      input({
        state: [
          makeRow({
            aspect: "translations",
            scope: "pt-BR",
            nextEligibleAt: FUTURE,
          }),
        ],
        activeLanguages: ["en-US", "pt-BR"],
      }),
    );
    expect(plan.items).toContainEqual({
      aspect: "logos",
      scope: "pt-BR",
      force: true,
    });
    // en-US is not a logo scope (logos are non-en only).
    expect(
      plan.items.filter(
        (i) => i.aspect === "logos" && i.scope === "en-US",
      ),
    ).toHaveLength(0);
  });

  it("does not bootstrap logos when a state row already exists", () => {
    const plan = computePlan(
      input({
        state: [
          makeRow({
            aspect: "logos",
            scope: "pt-BR",
            nextEligibleAt: FUTURE,
          }),
        ],
        activeLanguages: ["en-US", "pt-BR"],
      }),
    );
    expect(
      plan.items.filter(
        (i) => i.aspect === "logos" && i.scope === "pt-BR",
      ),
    ).toHaveLength(0);
  });
});
