import { describe, expect, it, vi } from "vitest";
import type { TmdbProvider, SearchResult } from "@canto/providers";

import { resolveExternalId } from "../resolve-external-id";

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

function makeResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    externalId: 1,
    provider: "tmdb" as SearchResult["provider"],
    type: "movie" as SearchResult["type"],
    title: "Any",
    ...overrides,
  };
}

type FakeTmdb = Pick<TmdbProvider, "findByImdbId" | "findByTvdbId">;

function makeTmdb(overrides: Partial<FakeTmdb> = {}): TmdbProvider {
  const base: FakeTmdb = {
    findByImdbId: vi.fn().mockResolvedValue([]),
    findByTvdbId: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  // The resolver only touches these two methods — cast the bare fake to
  // TmdbProvider so TS lets us pass it in without stubbing the full class.
  return base as unknown as TmdbProvider;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("resolveExternalId", () => {
  it("passes through an explicit tmdbId without making any TMDB call", async () => {
    const tmdb = makeTmdb();
    const result = await resolveExternalId(tmdb, {
      tmdbId: 51984,
      type: "movie",
    });
    expect(result).toEqual({ tmdbId: 51984, resolvedType: "movie" });
    expect(tmdb.findByImdbId).not.toHaveBeenCalled();
    expect(tmdb.findByTvdbId).not.toHaveBeenCalled();
  });

  it("falls back to findByImdbId when no tmdbId is given", async () => {
    const tmdb = makeTmdb({
      findByImdbId: vi
        .fn()
        .mockResolvedValue([
          makeResult({ externalId: 42, type: "movie", title: "Match" }),
        ]),
    });
    const result = await resolveExternalId(tmdb, {
      imdbId: "tt0000042",
      type: "movie",
    });
    expect(result).toEqual({ tmdbId: 42, resolvedType: "movie" });
    expect(tmdb.findByImdbId).toHaveBeenCalledWith("tt0000042");
  });

  it("prefers the IMDB result whose type matches the item type", async () => {
    // /find can return cross-type hits — the resolver should prefer the
    // one that matches item.type when multiple come back.
    const tmdb = makeTmdb({
      findByImdbId: vi.fn().mockResolvedValue([
        makeResult({ externalId: 100, type: "movie", title: "Movie Hit" }),
        makeResult({ externalId: 200, type: "show", title: "Show Hit" }),
      ]),
    });
    const result = await resolveExternalId(tmdb, {
      imdbId: "tt1",
      type: "show",
    });
    expect(result).toEqual({ tmdbId: 200, resolvedType: "show" });
  });

  it("falls back to the first result when no type match is found", async () => {
    const tmdb = makeTmdb({
      findByImdbId: vi.fn().mockResolvedValue([
        makeResult({ externalId: 100, type: "movie", title: "First" }),
        makeResult({ externalId: 200, type: "movie", title: "Second" }),
      ]),
    });
    const result = await resolveExternalId(tmdb, {
      imdbId: "tt1",
      type: "show",
    });
    expect(result).toEqual({ tmdbId: 100, resolvedType: "movie" });
  });

  it("falls through to findByTvdbId when imdbId lookup comes back empty", async () => {
    const tmdb = makeTmdb({
      findByImdbId: vi.fn().mockResolvedValue([]),
      findByTvdbId: vi
        .fn()
        .mockResolvedValue([
          makeResult({ externalId: 77, type: "show", title: "TVDB Hit" }),
        ]),
    });
    const result = await resolveExternalId(tmdb, {
      imdbId: "tt1",
      tvdbId: 12345,
      type: "show",
    });
    expect(result).toEqual({ tmdbId: 77, resolvedType: "show" });
    expect(tmdb.findByImdbId).toHaveBeenCalled();
    expect(tmdb.findByTvdbId).toHaveBeenCalledWith(12345);
  });

  it("uses tvdbId directly when it is the only id available", async () => {
    const tmdb = makeTmdb({
      findByTvdbId: vi
        .fn()
        .mockResolvedValue([
          makeResult({ externalId: 77, type: "show", title: "TVDB Only" }),
        ]),
    });
    const result = await resolveExternalId(tmdb, {
      tvdbId: 999,
      type: "show",
    });
    expect(result).toEqual({ tmdbId: 77, resolvedType: "show" });
    expect(tmdb.findByImdbId).not.toHaveBeenCalled();
  });

  it("returns null when no ids are present", async () => {
    const tmdb = makeTmdb();
    const result = await resolveExternalId(tmdb, { type: "movie" });
    expect(result).toBeNull();
    expect(tmdb.findByImdbId).not.toHaveBeenCalled();
    expect(tmdb.findByTvdbId).not.toHaveBeenCalled();
  });

  it("returns null when all fallbacks come back empty", async () => {
    const tmdb = makeTmdb({
      findByImdbId: vi.fn().mockResolvedValue([]),
      findByTvdbId: vi.fn().mockResolvedValue([]),
    });
    const result = await resolveExternalId(tmdb, {
      imdbId: "tt404",
      tvdbId: 404,
      type: "movie",
    });
    expect(result).toBeNull();
  });

  it("swallows provider errors and returns null", async () => {
    const tmdb = makeTmdb({
      findByImdbId: vi.fn().mockRejectedValue(new Error("TMDB 500")),
    });
    const result = await resolveExternalId(tmdb, {
      imdbId: "tt1",
      type: "movie",
    });
    expect(result).toBeNull();
  });
});
