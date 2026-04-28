import { describe, expect, it } from "vitest";

import { matchesSearchIntent } from "../parsing-episodes";

describe("matchesSearchIntent", () => {
  describe("full show mode (no season)", () => {
    const intent = { type: "show" as const };

    it("keeps season packs", () => {
      expect(matchesSearchIntent("Euphoria S03 1080p WEB-DL", intent)).toBe(
        true,
      );
    });

    it("keeps full-series packs without S/E tokens", () => {
      expect(
        matchesSearchIntent("Euphoria Complete 1080p Bluray", intent),
      ).toBe(true);
    });

    it("keeps multi-season range packs", () => {
      expect(matchesSearchIntent("Euphoria S01-S03 1080p", intent)).toBe(true);
    });

    it("drops single-episode releases", () => {
      expect(
        matchesSearchIntent("Euphoria S03E03 1080p AMZN WEB-DL", intent),
      ).toBe(false);
    });

    it("drops multi-episode range releases", () => {
      expect(
        matchesSearchIntent("Euphoria S03E01-E05 1080p", intent),
      ).toBe(false);
    });
  });

  describe("specific season mode", () => {
    const intent = { type: "show" as const, seasonNumber: 3 };

    it("keeps the requested season pack", () => {
      expect(matchesSearchIntent("Euphoria S03 1080p", intent)).toBe(true);
    });

    it("keeps full-series packs (no season tokens)", () => {
      expect(matchesSearchIntent("Euphoria Complete 1080p", intent)).toBe(
        true,
      );
    });

    it("drops other-season packs", () => {
      expect(matchesSearchIntent("Euphoria S01 1080p", intent)).toBe(false);
    });

    it("drops single-episode releases of that season", () => {
      expect(matchesSearchIntent("Euphoria S03E03 1080p", intent)).toBe(false);
    });

    it("drops multi-season range when requested season is in range but episodes are present-implicit (treated as episode)", () => {
      // S01-S03 has no episode tokens, IS a pack covering S03 → keep
      expect(matchesSearchIntent("Euphoria S01-S03 1080p", intent)).toBe(true);
    });
  });

  describe("specific episodes mode", () => {
    const intent = {
      type: "show" as const,
      seasonNumber: 3,
      episodeNumbers: [3],
    };

    it("keeps the matching single episode", () => {
      expect(matchesSearchIntent("Euphoria S03E03 1080p", intent)).toBe(true);
    });

    it("keeps the season pack containing it", () => {
      expect(matchesSearchIntent("Euphoria S03 1080p", intent)).toBe(true);
    });

    it("keeps full-series packs", () => {
      expect(matchesSearchIntent("Euphoria Complete 1080p", intent)).toBe(
        true,
      );
    });

    it("keeps multi-episode releases that include the requested episode", () => {
      expect(
        matchesSearchIntent("Euphoria S03E01-E10 1080p", intent),
      ).toBe(true);
    });

    it("drops episodes outside the requested set", () => {
      expect(matchesSearchIntent("Euphoria S03E04 1080p", intent)).toBe(false);
    });

    it("drops other-season episodes", () => {
      expect(matchesSearchIntent("Euphoria S01E03 1080p", intent)).toBe(false);
    });

    it("requires every requested episode to be present", () => {
      const multi = {
        type: "show" as const,
        seasonNumber: 3,
        episodeNumbers: [3, 4],
      };
      expect(matchesSearchIntent("Euphoria S03E03 1080p", multi)).toBe(false);
      expect(matchesSearchIntent("Euphoria S03E03E04 1080p", multi)).toBe(
        true,
      );
      expect(matchesSearchIntent("Euphoria S03E01-E05 1080p", multi)).toBe(
        true,
      );
    });
  });
});
