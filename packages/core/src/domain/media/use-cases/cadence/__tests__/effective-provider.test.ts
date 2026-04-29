import { describe, expect, it } from "vitest";

import { effectiveProvider } from "../effective-provider";

describe("effectiveProvider", () => {
  it("uses the per-media override when set, regardless of type or settings", () => {
    expect(
      effectiveProvider(
        { type: "show", provider: "tmdb", overrideProviderFor: "tvdb" },
        { tvdbDefaultShows: false },
      ),
    ).toBe("tvdb");
    expect(
      effectiveProvider(
        { type: "show", provider: "tvdb", overrideProviderFor: "tmdb" },
        { tvdbDefaultShows: true },
      ),
    ).toBe("tmdb");
  });

  it("returns 'tvdb' for shows when tvdbDefaultShows is on and no override is set", () => {
    expect(
      effectiveProvider(
        { type: "show", provider: "tmdb", overrideProviderFor: null },
        { tvdbDefaultShows: true },
      ),
    ).toBe("tvdb");
  });

  it("ignores tvdbDefaultShows for movies", () => {
    expect(
      effectiveProvider(
        { type: "movie", provider: "tmdb", overrideProviderFor: null },
        { tvdbDefaultShows: true },
      ),
    ).toBe("tmdb");
  });

  it("falls through to the row provider when no override and not a TVDB show", () => {
    expect(
      effectiveProvider(
        { type: "show", provider: "tmdb", overrideProviderFor: null },
        { tvdbDefaultShows: false },
      ),
    ).toBe("tmdb");
  });
});
