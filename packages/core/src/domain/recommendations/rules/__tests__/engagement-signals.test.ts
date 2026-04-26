import { describe, expect, it } from "vitest";
import { engagementMultiplier, isNegativeSignal } from "../engagement-signals";

describe("engagementMultiplier", () => {
  it("returns 1.0 for an empty signal", () => {
    expect(
      engagementMultiplier({ status: null, rating: null, isFavorite: false }),
    ).toBe(1.0);
  });

  it("boosts watching status", () => {
    expect(
      engagementMultiplier({ status: "watching", rating: null, isFavorite: false }),
    ).toBe(1.2);
  });

  it("boosts completed status above watching", () => {
    expect(
      engagementMultiplier({ status: "completed", rating: null, isFavorite: false }),
    ).toBe(1.5);
  });

  it("boosts favorite above completed", () => {
    expect(
      engagementMultiplier({ status: null, rating: null, isFavorite: true }),
    ).toBe(1.6);
  });

  it("rates 8+ above favorite", () => {
    expect(
      engagementMultiplier({ status: "completed", rating: 9, isFavorite: false }),
    ).toBe(1.8);
  });

  it("takes the max across all signals — 10/10 favorite completed", () => {
    expect(
      engagementMultiplier({ status: "completed", rating: 10, isFavorite: true }),
    ).toBe(1.8);
  });

  it("rates 6 gives a moderate boost", () => {
    expect(
      engagementMultiplier({ status: null, rating: 6, isFavorite: false }),
    ).toBe(1.3);
  });

  it("ignores ratings below 6", () => {
    expect(
      engagementMultiplier({ status: null, rating: 5, isFavorite: false }),
    ).toBe(1.0);
  });
});

describe("isNegativeSignal", () => {
  it("flags dropped status", () => {
    expect(
      isNegativeSignal({ status: "dropped", rating: null, isFavorite: false }),
    ).toBe(true);
  });

  it("flags low ratings", () => {
    expect(
      isNegativeSignal({ status: null, rating: 2, isFavorite: false }),
    ).toBe(true);
  });

  it("flags rating exactly 3", () => {
    expect(
      isNegativeSignal({ status: null, rating: 3, isFavorite: false }),
    ).toBe(true);
  });

  it("does not flag rating 4 (still bad but not extreme)", () => {
    expect(
      isNegativeSignal({ status: null, rating: 4, isFavorite: false }),
    ).toBe(false);
  });

  it("does not flag completed", () => {
    expect(
      isNegativeSignal({ status: "completed", rating: null, isFavorite: false }),
    ).toBe(false);
  });
});
