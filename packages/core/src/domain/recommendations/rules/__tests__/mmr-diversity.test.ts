import { describe, expect, it } from "vitest";
import { rankByMmr } from "../mmr-diversity";

interface Item {
  id: string;
  relevance: number;
  genreIds: number[];
}

const ACTION = [28];
const COMEDY = [35];
const DRAMA = [18];

describe("rankByMmr", () => {
  it("returns empty for empty input", () => {
    expect(rankByMmr<Item>([], 0.7, 5)).toEqual([]);
  });

  it("returns the single item unchanged", () => {
    const items: Item[] = [{ id: "a", relevance: 1, genreIds: ACTION }];
    expect(rankByMmr(items, 0.7, 5)).toEqual(items);
  });

  it("with λ=1.0 picks pure relevance order", () => {
    const items: Item[] = [
      { id: "a", relevance: 0.9, genreIds: ACTION },
      { id: "b", relevance: 0.7, genreIds: ACTION },
      { id: "c", relevance: 0.5, genreIds: ACTION },
    ];
    const ranked = rankByMmr(items, 1.0, 3);
    expect(ranked.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks up identical-genre clusters at λ=0.5", () => {
    const items: Item[] = [
      { id: "action-1", relevance: 1.0, genreIds: ACTION },
      { id: "action-2", relevance: 0.95, genreIds: ACTION },
      { id: "comedy-1", relevance: 0.7, genreIds: COMEDY },
      { id: "action-3", relevance: 0.6, genreIds: ACTION },
    ];
    const ranked = rankByMmr(items, 0.5, 3);
    // Top relevance still wins position 1; position 2 should jump to a
    // different genre rather than the next action title.
    expect(ranked[0]!.id).toBe("action-1");
    expect(ranked[1]!.id).toBe("comedy-1");
  });

  it("respects topK", () => {
    const items: Item[] = [
      { id: "a", relevance: 1, genreIds: ACTION },
      { id: "b", relevance: 0.5, genreIds: COMEDY },
      { id: "c", relevance: 0.3, genreIds: DRAMA },
    ];
    expect(rankByMmr(items, 0.7, 2)).toHaveLength(2);
  });

  it("handles empty genres without diversity penalty", () => {
    const items: Item[] = [
      { id: "a", relevance: 1, genreIds: [] },
      { id: "b", relevance: 0.5, genreIds: [] },
    ];
    const ranked = rankByMmr(items, 0.7, 2);
    expect(ranked.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
