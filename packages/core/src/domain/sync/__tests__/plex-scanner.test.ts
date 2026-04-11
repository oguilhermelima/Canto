import { describe, expect, it } from "vitest";

import {
  mapPlexItem,
  parsePlexGuids,
  resolvePlexMediaKind,
  type PlexLibraryRef,
} from "../plex-scanner";

const movieLib: PlexLibraryRef = {
  plexLibraryId: "1",
  type: "movies",
  linkId: "link-movies",
};

const showLib: PlexLibraryRef = {
  plexLibraryId: "2",
  type: "shows",
  linkId: "link-shows",
};

const mixedLib: PlexLibraryRef = {
  plexLibraryId: "3",
  type: "mixed",
  linkId: "link-mixed",
};

/* -------------------------------------------------------------------------- */
/*  parsePlexGuids                                                             */
/* -------------------------------------------------------------------------- */

describe("parsePlexGuids", () => {
  it("extracts all three provider ids from tmdb, imdb, tvdb schemes", () => {
    const ids = parsePlexGuids([
      { id: "tmdb://51984" },
      { id: "imdb://tt0119199" },
      { id: "tvdb://12345" },
    ]);
    expect(ids).toEqual({ tmdb: 51984, imdb: "tt0119199", tvdb: 12345 });
  });

  it("returns empty object when guids is undefined", () => {
    expect(parsePlexGuids(undefined)).toEqual({});
  });

  it("ignores unknown schemes", () => {
    const ids = parsePlexGuids([{ id: "anidb://42" }, { id: "tmdb://1" }]);
    expect(ids).toEqual({ tmdb: 1 });
  });

  it("silently drops non-numeric tmdb/tvdb ids", () => {
    const ids = parsePlexGuids([{ id: "tmdb://not-a-number" }, { id: "tvdb://abc" }]);
    expect(ids).toEqual({});
  });

  it("keeps the first matching value when duplicates exist", () => {
    const ids = parsePlexGuids([{ id: "tmdb://1" }, { id: "tmdb://2" }]);
    expect(ids.tmdb).toBe(2); // last-wins is the natural semantic of Object.assign
  });
});

/* -------------------------------------------------------------------------- */
/*  resolvePlexMediaKind                                                       */
/* -------------------------------------------------------------------------- */

describe("resolvePlexMediaKind", () => {
  it("movies library always yields movie", () => {
    expect(resolvePlexMediaKind("movies", undefined)).toBe("movie");
    expect(resolvePlexMediaKind("movies", "movie")).toBe("movie");
  });

  it("shows library always yields show", () => {
    expect(resolvePlexMediaKind("shows", undefined)).toBe("show");
  });

  it("mixed library dispatches on item type", () => {
    expect(resolvePlexMediaKind("mixed", "movie")).toBe("movie");
    expect(resolvePlexMediaKind("mixed", "show")).toBe("show");
  });

  it("mixed library returns null for unknown item types", () => {
    expect(resolvePlexMediaKind("mixed", "artist")).toBeNull();
    expect(resolvePlexMediaKind("mixed", undefined)).toBeNull();
  });

  it("returns null for unknown library types", () => {
    expect(resolvePlexMediaKind("music", "movie")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  mapPlexItem                                                                 */
/* -------------------------------------------------------------------------- */

describe("mapPlexItem", () => {
  it("maps a basic movie with playback data", () => {
    const mapped = mapPlexItem(
      {
        ratingKey: "42",
        title: "Amnesia",
        year: 1997,
        Guid: [{ id: "tmdb://51984" }],
        viewCount: 1,
        viewOffset: 90_000, // 90 seconds
        lastViewedAt: 1_712_750_400,
      },
      movieLib,
    );

    expect(mapped).not.toBeNull();
    expect(mapped!.source).toBe("plex");
    expect(mapped!.serverItemId).toBe("42");
    expect(mapped!.serverLinkId).toBe("link-movies");
    expect(mapped!.type).toBe("movie");
    expect(mapped!.externalIds.tmdb).toBe(51984);
    expect(mapped!.playback.played).toBe(true);
    expect(mapped!.playback.positionSeconds).toBe(90);
    expect(mapped!.playback.lastPlayedAt).toBeInstanceOf(Date);
  });

  it("skips items without ratingKey", () => {
    expect(mapPlexItem({ title: "No key" }, movieLib)).toBeNull();
  });

  it("skips items without title", () => {
    expect(mapPlexItem({ ratingKey: "1" }, movieLib)).toBeNull();
  });

  it("skips mixed-library items with unknown type", () => {
    expect(mapPlexItem({ ratingKey: "1", title: "x", type: "album" }, mixedLib)).toBeNull();
  });

  it("reports played=false when viewCount is 0", () => {
    const mapped = mapPlexItem({ ratingKey: "1", title: "x" }, showLib);
    expect(mapped!.playback.played).toBe(false);
  });

  it("leaves positionSeconds undefined when viewOffset is missing", () => {
    const mapped = mapPlexItem({ ratingKey: "1", title: "x" }, showLib);
    expect(mapped!.playback.positionSeconds).toBeUndefined();
  });
});
