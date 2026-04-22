import { describe, expect, it } from "vitest";

import {
  extractJellyfinFileInfo,
  extractPlexFileInfo,
} from "../fetch-info";

describe("extractJellyfinFileInfo", () => {
  it("extracts HDR10 movie with multi-audio", () => {
    const info = extractJellyfinFileInfo({
      Id: "ep1",
      RunTimeTicks: 72_000_000_000, // 120 minutes in ticks (ms * 10_000)
      MediaSources: [
        {
          Container: "mkv",
          Size: 12_345_678_901,
          Path: "/movies/x.mkv",
          Bitrate: 8_000_000,
          MediaStreams: [
            {
              Type: "Video",
              Codec: "hevc",
              Height: 2160,
              VideoRange: "HDR",
              VideoRangeType: "HDR10",
            },
            { Type: "Audio", Codec: "truehd", Language: "eng", IsDefault: true },
            { Type: "Audio", Codec: "ac3", Language: "por" },
            { Type: "Subtitle", Language: "eng" },
            { Type: "Subtitle", Language: "por" },
          ],
        },
      ],
    });

    expect(info.resolution).toBe("4K");
    expect(info.videoCodec).toBe("hevc");
    expect(info.audioCodec).toBe("truehd");
    expect(info.container).toBe("mkv");
    expect(info.fileSize).toBe(12_345_678_901);
    expect(info.bitrate).toBe(8_000_000);
    expect(info.durationMs).toBe(7_200_000);
    expect(info.hdr).toBe("HDR10");
    expect(info.primaryAudioLang).toBe("eng");
    expect(info.audioLangs).toEqual(["eng", "por"]);
    expect(info.subtitleLangs).toEqual(["eng", "por"]);
  });

  it("detects Dolby Vision", () => {
    const info = extractJellyfinFileInfo({
      Id: "dv1",
      MediaSources: [
        {
          Container: "mp4",
          MediaStreams: [
            {
              Type: "Video",
              Codec: "hevc",
              Height: 2160,
              VideoRangeType: "DOVI",
            },
            { Type: "Audio", Codec: "eac3", Language: "eng", IsDefault: true },
          ],
        },
      ],
    });

    expect(info.hdr).toBe("DolbyVision");
  });

  it("handles subtitle-only episode gracefully", () => {
    const info = extractJellyfinFileInfo({
      Id: "sub1",
      MediaSources: [
        {
          Container: "mkv",
          MediaStreams: [
            { Type: "Video", Codec: "h264", Height: 720 },
            { Type: "Subtitle", Language: "eng" },
            { Type: "Subtitle", Language: "spa" },
          ],
        },
      ],
    });

    expect(info.resolution).toBe("720p");
    expect(info.primaryAudioLang).toBeUndefined();
    expect(info.audioLangs).toEqual([]);
    expect(info.subtitleLangs).toEqual(["eng", "spa"]);
  });
});

describe("extractPlexFileInfo", () => {
  it("extracts HDR10 movie", () => {
    const info = extractPlexFileInfo({
      ratingKey: "42",
      Media: [
        {
          videoCodec: "hevc",
          audioCodec: "eac3",
          container: "mkv",
          bitrate: 10_000,
          videoResolution: "4k",
          videoDynamicRange: "HDR10",
          Part: [
            {
              file: "/plex/4k.mkv",
              size: 20_000_000,
              duration: 7_200_000,
              Stream: [
                {
                  streamType: 1,
                  codec: "hevc",
                  colorPrimaries: "bt2020",
                  colorTrc: "smpte2084",
                },
                {
                  streamType: 2,
                  codec: "eac3",
                  languageTag: "en",
                  default: true,
                  selected: true,
                },
                { streamType: 3, languageTag: "en" },
              ],
            },
          ],
        },
      ],
    });

    expect(info.resolution).toBe("4K");
    expect(info.videoCodec).toBe("hevc");
    expect(info.audioCodec).toBe("eac3");
    expect(info.container).toBe("mkv");
    expect(info.fileSize).toBe(20_000_000);
    expect(info.bitrate).toBe(10_000);
    expect(info.durationMs).toBe(7_200_000);
    expect(info.hdr).toBe("HDR10");
    expect(info.primaryAudioLang).toBe("en");
    expect(info.audioLangs).toEqual(["en"]);
    expect(info.subtitleLangs).toEqual(["en"]);
  });

  it("detects Dolby Vision via videoDoViPresent", () => {
    const info = extractPlexFileInfo({
      ratingKey: "99",
      Media: [
        {
          videoCodec: "hevc",
          videoResolution: "1080",
          videoDoViPresent: true,
          Part: [
            {
              Stream: [
                { streamType: 1, codec: "hevc" },
                {
                  streamType: 2,
                  codec: "truehd",
                  languageTag: "en",
                  default: true,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(info.hdr).toBe("DolbyVision");
    expect(info.resolution).toBe("1080p");
  });

  it("multi-audio episode picks selected as primary", () => {
    const info = extractPlexFileInfo({
      ratingKey: "ep-7",
      parentIndex: 2,
      index: 7,
      Media: [
        {
          videoCodec: "h264",
          videoResolution: "1080",
          Part: [
            {
              Stream: [
                { streamType: 1, codec: "h264" },
                { streamType: 2, codec: "aac", languageTag: "en", default: true },
                {
                  streamType: 2,
                  codec: "eac3",
                  languageTag: "pt-BR",
                  selected: true,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(info.primaryAudioLang).toBe("pt-BR");
    expect(info.audioLangs).toEqual(["en", "pt-BR"]);
  });
});
