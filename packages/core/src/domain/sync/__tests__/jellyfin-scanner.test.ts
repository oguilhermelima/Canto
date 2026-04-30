import { describe, expect, it } from "vitest";

import {
  buildPlayback,
  mapJellyfinItem,
  parseJellyfinProviderIds
  
  
} from "../jellyfin-scanner";
import type {JellyfinLibraryRef, JellyfinMapContext} from "../jellyfin-scanner";

const lib: JellyfinLibraryRef = {
  jellyfinLibraryId: "lib-1",
  type: "mixed",
  linkId: "link-1",
};

function ctx(
  seriesById: Map<
    string,
    Parameters<typeof mapJellyfinItem>[1]
  > = new Map(),
): JellyfinMapContext {
  return { lib, seriesById: seriesById as never };
}

/* -------------------------------------------------------------------------- */
/*  parseJellyfinProviderIds                                                    */
/* -------------------------------------------------------------------------- */

describe("parseJellyfinProviderIds", () => {
  it("handles all three providers", () => {
    const ids = parseJellyfinProviderIds({
      Tmdb: "51984",
      Imdb: "tt0119199",
      Tvdb: "12345",
    });
    expect(ids).toEqual({ tmdb: 51984, imdb: "tt0119199", tvdb: 12345 });
  });

  it("returns empty when raw is undefined", () => {
    expect(parseJellyfinProviderIds(undefined)).toEqual({});
  });

  it("drops non-numeric tmdb/tvdb ids", () => {
    expect(parseJellyfinProviderIds({ Tmdb: "abc", Tvdb: "xyz" })).toEqual({});
  });

  it("preserves only the fields that are present", () => {
    expect(parseJellyfinProviderIds({ Imdb: "tt42" })).toEqual({ imdb: "tt42" });
  });
});

/* -------------------------------------------------------------------------- */
/*  buildPlayback                                                                */
/* -------------------------------------------------------------------------- */

describe("buildPlayback", () => {
  it("returns safe defaults for undefined user data", () => {
    expect(buildPlayback(undefined)).toEqual({
      played: false,
      positionSeconds: undefined,
      lastPlayedAt: undefined,
    });
  });

  it("converts ticks to seconds (1 second = 10_000_000 ticks)", () => {
    const playback = buildPlayback({ PlaybackPositionTicks: 30_000_000, Played: false });
    expect(playback.positionSeconds).toBe(3);
  });

  it("parses LastPlayedDate into a Date", () => {
    const playback = buildPlayback({ LastPlayedDate: "2026-04-10T12:00:00Z" });
    expect(playback.lastPlayedAt).toBeInstanceOf(Date);
  });

  it("rejects invalid LastPlayedDate strings", () => {
    const playback = buildPlayback({ LastPlayedDate: "not a date" });
    expect(playback.lastPlayedAt).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  mapJellyfinItem — Movie                                                     */
/* -------------------------------------------------------------------------- */

describe("mapJellyfinItem (Movie)", () => {
  it("maps a movie with provider ids", () => {
    const mapped = mapJellyfinItem(
      "Movie",
      {
        Id: "mv-1",
        Name: "Amnesia",
        ProductionYear: 1997,
        Path: "/m/amnesia.mkv",
        ProviderIds: { Tmdb: "51984" },
        UserData: { Played: true, PlaybackPositionTicks: 60_000_000 },
      },
      ctx(),
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.source).toBe("jellyfin");
    expect(mapped!.type).toBe("movie");
    expect(mapped!.serverItemId).toBe("mv-1");
    expect(mapped!.externalIds.tmdb).toBe(51984);
    expect(mapped!.path).toBe("/m/amnesia.mkv");
    expect(mapped!.playback.played).toBe(true);
    expect(mapped!.playback.positionSeconds).toBe(6);
  });

  it("drops movies with no Id", () => {
    const mapped = mapJellyfinItem("Movie", { Id: "", Name: "no id" }, ctx());
    expect(mapped).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  mapJellyfinItem — Series                                                    */
/* -------------------------------------------------------------------------- */

describe("mapJellyfinItem (Series)", () => {
  it("maps a series to type=show", () => {
    const mapped = mapJellyfinItem(
      "Series",
      {
        Id: "sr-1",
        Name: "Daredevil: Born Again",
        ProductionYear: 2025,
        ProviderIds: { Tmdb: "202555" },
      },
      ctx(),
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe("show");
    expect(mapped!.serverItemId).toBe("sr-1");
    expect(mapped!.externalIds.tmdb).toBe(202555);
  });
});

/* -------------------------------------------------------------------------- */
/*  mapJellyfinItem — Episode                                                   */
/* -------------------------------------------------------------------------- */

describe("mapJellyfinItem (Episode)", () => {
  it("ignores episodes without any playback data", () => {
    const mapped = mapJellyfinItem(
      "Episode",
      {
        Id: "ep-1",
        Name: "E1",
        SeriesId: "sr-1",
        ParentIndexNumber: 1,
        IndexNumber: 1,
      },
      ctx(),
    );
    expect(mapped).toBeNull();
  });

  it("inherits series title + provider ids from the parent series", () => {
    const series = new Map([
      [
        "sr-1",
        {
          Id: "sr-1",
          Name: "Invincible",
          ProductionYear: 2021,
          ProviderIds: { Tmdb: "95557" },
        },
      ],
    ]);
    const mapped = mapJellyfinItem(
      "Episode",
      {
        Id: "ep-77",
        Name: "Episode 7",
        SeriesId: "sr-1",
        ParentIndexNumber: 2,
        IndexNumber: 7,
        UserData: { Played: true, LastPlayedDate: "2026-04-10T12:00:00Z" },
      },
      ctx(series as never),
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.title).toBe("Invincible");
    expect(mapped!.year).toBe(2021);
    expect(mapped!.externalIds.tmdb).toBe(95557);
    expect(mapped!.serverItemId).toBe("sr-1");
    expect(mapped!.playback.seasonNumber).toBe(2);
    expect(mapped!.playback.episodeNumber).toBe(7);
    expect(mapped!.playback.played).toBe(true);
  });

  it("falls back to episode's own metadata when series isn't loaded", () => {
    const mapped = mapJellyfinItem(
      "Episode",
      {
        Id: "ep-1",
        Name: "Pilot",
        SeriesId: "sr-missing",
        SeriesName: "Fallback",
        ProductionYear: 2024,
        ProviderIds: { Tmdb: "238892" },
        ParentIndexNumber: 1,
        IndexNumber: 1,
        UserData: { Played: true },
      },
      ctx(),
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.title).toBe("Fallback");
    expect(mapped!.year).toBe(2024);
    expect(mapped!.externalIds.tmdb).toBe(238892);
    expect(mapped!.serverItemId).toBe("sr-missing");
  });

  it("emits an episode when there is only a playback position (no played flag)", () => {
    const mapped = mapJellyfinItem(
      "Episode",
      {
        Id: "ep-1",
        Name: "Mid-watch",
        SeriesId: "sr-1",
        SeriesName: "Something",
        ParentIndexNumber: 1,
        IndexNumber: 2,
        UserData: { PlaybackPositionTicks: 600_000_000 }, // 60 seconds
      },
      ctx(),
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.playback.positionSeconds).toBe(60);
    expect(mapped!.playback.played).toBe(false);
  });
});
