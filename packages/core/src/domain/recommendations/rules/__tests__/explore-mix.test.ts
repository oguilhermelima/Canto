import { describe, expect, it } from "vitest";
import { exploreSlotPositions, mixExploreSlots } from "../explore-mix";

describe("exploreSlotPositions", () => {
  it("returns 0 slots for tiny pages", () => {
    expect(exploreSlotPositions(3)).toEqual([]);
  });

  it("returns 1 slot for a 5-item page", () => {
    expect(exploreSlotPositions(5)).toEqual([3]);
  });

  it("returns 2 slots for a 10-item page", () => {
    expect(exploreSlotPositions(10)).toEqual([3, 8]);
  });

  it("returns 4 slots for a 20-item page", () => {
    expect(exploreSlotPositions(20)).toEqual([3, 8, 13, 18]);
  });
});

describe("mixExploreSlots", () => {
  const personalized = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];

  it("returns the original list when there is nothing to inject", () => {
    expect(mixExploreSlots(personalized, [])).toEqual(personalized);
  });

  it("replaces fixed slots with explore items", () => {
    const result = mixExploreSlots(personalized, ["e0", "e1"]);
    expect(result[3]).toBe("e0");
    expect(result[8]).toBe("e1");
    // Other positions untouched.
    expect(result[0]).toBe("p0");
    expect(result[5]).toBe("p5");
  });

  it("stops when explore items run out", () => {
    const result = mixExploreSlots(personalized, ["e0"]);
    expect(result[3]).toBe("e0");
    expect(result[8]).toBe("p8"); // not replaced
  });

  it("preserves length", () => {
    const result = mixExploreSlots(personalized, ["e0", "e1"]);
    expect(result).toHaveLength(personalized.length);
  });
});
