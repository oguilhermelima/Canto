import { describe, expect, it } from "vitest";

import {
  deduplicateScannedItems,
  toMediaVersionInsert,
  validateScannedItems,
} from "../sync-pipeline";
import type { ScannedMediaItem } from "../types";
import type { MediaFileInfo } from "../../media-servers/use-cases/fetch-info";

function scanned(overrides: Partial<ScannedMediaItem> = {}): ScannedMediaItem {
  return {
    source: "jellyfin",
    serverItemId: "id-1",
    serverLinkId: "link-1",
    libraryId: null,
    title: "Amnesia",
    year: 1997,
    type: "movie",
    externalIds: { tmdb: 51984 },
    path: "/a.mkv",
    playback: { played: false },
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  validateScannedItems                                                        */
/* -------------------------------------------------------------------------- */

describe("validateScannedItems", () => {
  it("drops items with empty serverItemId", () => {
    const items = [
      scanned({ serverItemId: "" }),
      scanned({ serverItemId: "ok" }),
    ];
    expect(validateScannedItems(items, "test")).toHaveLength(1);
  });

  it("keeps all valid items", () => {
    const items = [scanned({ serverItemId: "a" }), scanned({ serverItemId: "b" })];
    expect(validateScannedItems(items, "test")).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  deduplicateScannedItems                                                    */
/* -------------------------------------------------------------------------- */

describe("deduplicateScannedItems", () => {
  it("deduplicates within the same source", () => {
    const items = [
      scanned({ source: "plex", serverItemId: "1" }),
      scanned({ source: "plex", serverItemId: "1" }),
      scanned({ source: "plex", serverItemId: "2" }),
    ];
    expect(deduplicateScannedItems(items)).toHaveLength(2);
  });

  it("keeps cross-source pairs — Plex + Jellyfin for the same media must both flow through", () => {
    const items = [
      scanned({ source: "plex", serverItemId: "plex-42" }),
      scanned({ source: "jellyfin", serverItemId: "jf-42" }),
    ];
    const out = deduplicateScannedItems(items);
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.source).sort()).toEqual(["jellyfin", "plex"]);
  });

  it("does not merge cross-source items even when they share a serverItemId", () => {
    // Pathological but possible: both servers happening to pick the same id.
    const items = [
      scanned({ source: "plex", serverItemId: "42" }),
      scanned({ source: "jellyfin", serverItemId: "42" }),
    ];
    expect(deduplicateScannedItems(items)).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  toMediaVersionInsert                                                       */
/* -------------------------------------------------------------------------- */

describe("toMediaVersionInsert", () => {
  const now = new Date("2026-04-10T12:00:00.000Z");

  it("passes through core identity fields", () => {
    const out = toMediaVersionInsert(scanned(), {
      result: "imported",
      syncedAt: now,
    });
    expect(out.source).toBe("jellyfin");
    expect(out.serverItemId).toBe("id-1");
    expect(out.serverLinkId).toBe("link-1");
    expect(out.serverItemTitle).toBe("Amnesia");
    expect(out.serverItemYear).toBe(1997);
    expect(out.serverItemPath).toBe("/a.mkv");
    expect(out.syncedAt).toBe(now);
  });

  it("prefers explicit tmdbId over scanned external tmdbId", () => {
    const out = toMediaVersionInsert(scanned({ externalIds: { tmdb: 1 } }), {
      tmdbId: 999,
      result: "imported",
      syncedAt: now,
    });
    expect(out.tmdbId).toBe(999);
  });

  it("falls back to scanned tmdbId when no override", () => {
    const out = toMediaVersionInsert(scanned({ externalIds: { tmdb: 42 } }), {
      result: "imported",
      syncedAt: now,
    });
    expect(out.tmdbId).toBe(42);
  });

  it("defaults reason to null", () => {
    const out = toMediaVersionInsert(scanned(), { result: "imported", syncedAt: now });
    expect(out.reason).toBeNull();
  });

  it("attaches a provided mediaId", () => {
    const out = toMediaVersionInsert(scanned(), {
      mediaId: "media-x",
      result: "skipped",
      syncedAt: now,
    });
    expect(out.mediaId).toBe("media-x");
    expect(out.result).toBe("skipped");
  });

  it("produces a valid unmatched row when mediaId is undefined", () => {
    const out = toMediaVersionInsert(scanned({ externalIds: {} }), {
      result: "unmatched",
      reason: "No provider id on server — admin action required",
      syncedAt: now,
    });
    expect(out.result).toBe("unmatched");
    expect(out.mediaId).toBeNull();
    expect(out.tmdbId).toBeNull();
    expect(out.reason).toBe("No provider id on server — admin action required");
    // Source-of-truth fields must still be present — the upsert relies on them.
    expect(out.serverItemId).toBe("id-1");
    expect(out.serverLinkId).toBe("link-1");
    expect(out.source).toBe("jellyfin");
  });

  it("projects quality metadata onto the row when provided", () => {
    const quality: MediaFileInfo = {
      resolution: "4K",
      videoCodec: "hevc",
      audioCodec: "truehd",
      container: "mkv",
      fileSize: 12_345_678_901,
      bitrate: 8_000_000,
      durationMs: 7_200_000,
      hdr: "HDR10",
      primaryAudioLang: "eng",
      audioLangs: ["eng", "por"],
      subtitleLangs: ["eng"],
    };
    const out = toMediaVersionInsert(scanned(), {
      mediaId: "m1",
      result: "imported",
      syncedAt: now,
      quality,
    });
    expect(out.resolution).toBe("4K");
    expect(out.videoCodec).toBe("hevc");
    expect(out.audioCodec).toBe("truehd");
    expect(out.container).toBe("mkv");
    expect(out.fileSize).toBe(12_345_678_901);
    expect(out.bitrate).toBe(8_000_000);
    expect(out.durationMs).toBe(7_200_000);
    expect(out.hdr).toBe("HDR10");
    expect(out.primaryAudioLang).toBe("eng");
    expect(out.audioLangs).toEqual(["eng", "por"]);
    expect(out.subtitleLangs).toEqual(["eng"]);
  });

  it("leaves quality fields null when no quality extras are provided", () => {
    const out = toMediaVersionInsert(scanned(), {
      mediaId: "m1",
      result: "imported",
      syncedAt: now,
    });
    expect(out.resolution).toBeNull();
    expect(out.videoCodec).toBeNull();
    expect(out.hdr).toBeNull();
    expect(out.audioLangs).toBeNull();
    expect(out.subtitleLangs).toBeNull();
  });
});
