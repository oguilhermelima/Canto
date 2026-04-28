import { describe, expect, it } from "vitest";
import { DEFAULT_DOWNLOAD_SCORING_RULES } from "@canto/db";

import { calculateConfidence } from "../scoring";
import type { ScoringRules } from "../scoring-rules";
import { parseReleaseAttributes } from "../../../torrents/rules/release-attributes";
import type {
  ReleaseFlavor,
  ReleaseGroupTierSets,
} from "../../../torrents/rules/release-groups";
import type { ConfidenceContext } from "../../../torrents/types/common";

const RULES = DEFAULT_DOWNLOAD_SCORING_RULES as unknown as ScoringRules;

const CTX: ConfidenceContext = { hasDigitalRelease: true };

/**
 * Small static tier-set fixture mirroring the most influential entries
 * the seed inserts into `download_release_group`. We keep this curated
 * (rather than re-reading the seed) so the fixture is trivially
 * reviewable and a tier change to the seed forces a deliberate update
 * here.
 */
const MOVIE_TIERS: ReleaseGroupTierSets = {
  tier1: new Set(["flux", "ntb", "don", "ebp"]),
  tier2: new Set(["cmrg", "rawr", "ntg"]),
  tier3: new Set(["roccat", "kogi", "ethics"]),
  avoid: new Set(["yts", "rarbg", "evo", "fgt", "psa", "galaxyrg"]),
};
const SHOW_TIERS: ReleaseGroupTierSets = {
  tier1: new Set(["flux", "ntb", "cmrg", "rawr"]),
  tier2: new Set(["ntg", "tommy"]),
  tier3: new Set(["visum"]),
  avoid: new Set(["yts", "rarbg", "evo"]),
};
const ANIME_TIERS: ReleaseGroupTierSets = {
  tier1: new Set(["vodes", "kulot", "mtbb"]),
  tier2: new Set(["asw", "yameii"]),
  tier3: new Set(["subsplease", "erai-raws"]),
  avoid: new Set(["judas", "horriblerips"]),
};

const TIERS_BY_FLAVOR: Record<ReleaseFlavor, ReleaseGroupTierSets> = {
  movie: MOVIE_TIERS,
  show: SHOW_TIERS,
  anime: ANIME_TIERS,
};

interface Sample {
  title: string;
  flavor: ReleaseFlavor;
  seeders: number;
  age: number;
  flags?: string[];
}

function score(sample: Sample): number {
  const attrs = parseReleaseAttributes({
    title: sample.title,
    seeders: sample.seeders,
    age: sample.age,
    flags: sample.flags ?? [],
    flavor: sample.flavor,
    releaseGroupLookups: TIERS_BY_FLAVOR[sample.flavor],
  });
  return calculateConfidence(attrs, CTX, RULES);
}

/**
 * Snapshot fixtures. Each entry pins a real-world torrent title to its
 * expected confidence score under the canonical default rules. The
 * point of locking these numbers in is to make weight changes show up
 * as an explicit, reviewable diff: if you bump UHD from 30 → 32, this
 * file is the place that says "yes I meant to bump it, here's the
 * downstream effect on real titles".
 *
 * To regenerate after an intentional rules change: run the suite with
 * `--update`. To regenerate by hand, copy the actual values printed by
 * a failing run.
 */
describe("scoring engine — corpus snapshot", () => {
  const corpus: Sample[] = [
    // ── Movies ──
    {
      title: "Blade.Runner.2049.2017.UHD.BluRay.2160p.REMUX.HEVC.DV.HDR10.TrueHD.7.1.Atmos-FLUX",
      flavor: "movie",
      seeders: 250,
      age: 90,
    },
    {
      title: "Blade.Runner.2049.2017.2160p.UHD.BluRay.x265.HDR10.DTS-HD.MA.7.1-NTb",
      flavor: "movie",
      seeders: 120,
      age: 90,
    },
    {
      title: "Blade.Runner.2049.2017.1080p.BluRay.REMUX.AVC.DTS-HD.MA.7.1-DON",
      flavor: "movie",
      seeders: 80,
      age: 100,
    },
    {
      title: "Blade.Runner.2049.2017.1080p.BluRay.x264-EVO",
      flavor: "movie",
      seeders: 600,
      age: 200,
    },
    {
      title: "Blade.Runner.2049.2017.720p.HDRip.x264-YTS.AG",
      flavor: "movie",
      seeders: 1000,
      age: 300,
    },
    {
      title: "Blade.Runner.2049.2017.HDTC.x264-CAM",
      flavor: "movie",
      seeders: 50,
      age: 1,
    },
    {
      title: "Dune.Part.Two.2024.UHD.BluRay.2160p.REMUX.HDR10+.HEVC.TrueHD.7.1.Atmos-FraMeSToR",
      flavor: "movie",
      seeders: 180,
      age: 30,
    },
    {
      title: "Dune.Part.Two.2024.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX",
      flavor: "movie",
      seeders: 220,
      age: 14,
    },
    {
      title: "Dune.Part.Two.2024.MULTi.1080p.BluRay.x264-LOST",
      flavor: "movie",
      seeders: 60,
      age: 60,
    },
    {
      title: "Oppenheimer.2023.REPACK2.1080p.BluRay.x264.DTS-HD.MA.5.1-NTb",
      flavor: "movie",
      seeders: 90,
      age: 200,
    },

    // ── Shows ──
    {
      title: "Severance.S02E03.1080p.WEB.h264-FLUX",
      flavor: "show",
      seeders: 400,
      age: 5,
      flags: ["freeleech"],
    },
    {
      title: "Severance.S02E03.2160p.ATVP.WEB-DL.DDP5.1.HDR10+.H.265-NTb",
      flavor: "show",
      seeders: 200,
      age: 5,
    },
    {
      title: "Severance.S02E03.HDTV.x264-RARBG",
      flavor: "show",
      seeders: 800,
      age: 1,
    },
    {
      title: "The.Bear.S03.Complete.1080p.HULU.WEB-DL.DDP5.1.H.264-CMRG",
      flavor: "show",
      seeders: 150,
      age: 30,
    },
    {
      title: "The.Bear.S03.PROPER.1080p.WEB.h264-NTb",
      flavor: "show",
      seeders: 130,
      age: 25,
    },
    {
      title: "Mr.Robot.S04E13.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTG",
      flavor: "show",
      seeders: 50,
      age: 1500,
    },

    // ── Anime ──
    {
      title: "[Vodes] Frieren - Beyond Journey's End - 28 (BD 1080p HEVC AAC) [DUAL].mkv",
      flavor: "anime",
      seeders: 90,
      age: 14,
    },
    {
      title: "[SubsPlease] Frieren - Beyond Journey's End - 28 (1080p) [E5F1B96A].mkv",
      flavor: "anime",
      seeders: 250,
      age: 1,
    },
    {
      title: "[Judas] Frieren - Beyond Journey's End - 28 [1080p][HEVC x265 10bit][Multi-Subs].mkv",
      flavor: "anime",
      seeders: 30,
      age: 5,
    },
    {
      title: "[Erai-raws] Spy x Family - 25 [1080p][Multiple Subtitle][2C9B4DEF].mkv",
      flavor: "anime",
      seeders: 180,
      age: 7,
    },

    // ── Penalty edges ──
    {
      title: "Some.Movie.2024.2160p.WEB-DL.DDP5.1.x264-RARBG",
      flavor: "movie",
      seeders: 200,
      age: 14,
    }, // UHD without HDR — penalty fires
    {
      title: "Some.Movie.2024.NUKED.1080p.WEB-DL.DDP5.1.H.264-FLUX",
      flavor: "movie",
      seeders: 50,
      age: 14,
      flags: ["nuked"],
    }, // nuked overrides everything
    {
      title: "Some.Movie.2024.1080p.WEB.AV1-DiRT",
      flavor: "movie",
      seeders: 25,
      age: 14,
    },
  ];

  /**
   * Cohort assertions — these assert relationships, not exact numbers.
   * They survive minor weight tuning and exist to encode the design
   * intent ("DV+Atmos jackpot beats SDR Remux of the same release",
   * "avoid groups always lose to T1") in a way that won't break on
   * rounding.
   */
  it("UHD Remux DV Atmos jackpot beats UHD HDR10 only", () => {
    const flux = score(corpus[0]!); // FLUX DV+HDR10+Atmos
    const ntb = score(corpus[1]!); // NTb HDR10+DTS-HD
    expect(flux).toBeGreaterThan(ntb);
  });

  it("FLUX UHD outranks DON 1080p Remux when both have premium audio", () => {
    expect(score(corpus[0]!)).toBeGreaterThan(score(corpus[2]!));
  });

  it("avoid groups (EVO, YTS, RARBG) always lose to T1 of the same release", () => {
    expect(score(corpus[0]!)).toBeGreaterThan(score(corpus[3]!));
    expect(score(corpus[10]!)).toBeGreaterThan(score(corpus[12]!));
  });

  it("CAM with digital release available drops near zero", () => {
    expect(score(corpus[5]!)).toBeLessThanOrEqual(5);
  });


  it("anime T3 (Erai-raws) beats anime avoid (Judas)", () => {
    expect(score(corpus[19]!)).toBeGreaterThan(score(corpus[18]!));
  });

  it("UHD without HDR is penalised below the IMAX UHD HDR equivalent", () => {
    expect(score(corpus[20]!)).toBeLessThan(score(corpus[7]!));
  });

  it("nuked flag drives the score to 0", () => {
    expect(score(corpus[21]!)).toBe(0);
  });

  /**
   * Frozen numeric snapshot. Run the suite; if a value drifts the diff
   * is the design review.
   */
  it.skip("dump scores for snapshot regen", () => {
    for (const s of corpus) console.log(score(s), s.title);
  });

  it("frozen snapshot — fail on drift", () => {
    const snapshot = corpus.map((s) => ({ title: s.title, score: score(s) }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "score": 81,
          "title": "Blade.Runner.2049.2017.UHD.BluRay.2160p.REMUX.HEVC.DV.HDR10.TrueHD.7.1.Atmos-FLUX",
        },
        {
          "score": 73,
          "title": "Blade.Runner.2049.2017.2160p.UHD.BluRay.x265.HDR10.DTS-HD.MA.7.1-NTb",
        },
        {
          "score": 62,
          "title": "Blade.Runner.2049.2017.1080p.BluRay.REMUX.AVC.DTS-HD.MA.7.1-DON",
        },
        {
          "score": 28,
          "title": "Blade.Runner.2049.2017.1080p.BluRay.x264-EVO",
        },
        {
          "score": 15,
          "title": "Blade.Runner.2049.2017.720p.HDRip.x264-YTS.AG",
        },
        {
          "score": 0,
          "title": "Blade.Runner.2049.2017.HDTC.x264-CAM",
        },
        {
          "score": 69,
          "title": "Dune.Part.Two.2024.UHD.BluRay.2160p.REMUX.HDR10+.HEVC.TrueHD.7.1.Atmos-FraMeSToR",
        },
        {
          "score": 74,
          "title": "Dune.Part.Two.2024.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX",
        },
        {
          "score": 48,
          "title": "Dune.Part.Two.2024.MULTi.1080p.BluRay.x264-LOST",
        },
        {
          "score": 63,
          "title": "Oppenheimer.2023.REPACK2.1080p.BluRay.x264.DTS-HD.MA.5.1-NTb",
        },
        {
          "score": 56,
          "title": "Severance.S02E03.1080p.WEB.h264-FLUX",
        },
        {
          "score": 70,
          "title": "Severance.S02E03.2160p.ATVP.WEB-DL.DDP5.1.HDR10+.H.265-NTb",
        },
        {
          "score": 15,
          "title": "Severance.S02E03.HDTV.x264-RARBG",
        },
        {
          "score": 59,
          "title": "The.Bear.S03.Complete.1080p.HULU.WEB-DL.DDP5.1.H.264-CMRG",
        },
        {
          "score": 53,
          "title": "The.Bear.S03.PROPER.1080p.WEB.h264-NTb",
        },
        {
          "score": 51,
          "title": "Mr.Robot.S04E13.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTG",
        },
        {
          "score": 37,
          "title": "[Vodes] Frieren - Beyond Journey's End - 28 (BD 1080p HEVC AAC) [DUAL].mkv",
        },
        {
          "score": 41,
          "title": "[SubsPlease] Frieren - Beyond Journey's End - 28 (1080p) [E5F1B96A].mkv",
        },
        {
          "score": 35,
          "title": "[Judas] Frieren - Beyond Journey's End - 28 [1080p][HEVC x265 10bit][Multi-Subs].mkv",
        },
        {
          "score": 40,
          "title": "[Erai-raws] Spy x Family - 25 [1080p][Multiple Subtitle][2C9B4DEF].mkv",
        },
        {
          "score": 22,
          "title": "Some.Movie.2024.2160p.WEB-DL.DDP5.1.x264-RARBG",
        },
        {
          "score": 0,
          "title": "Some.Movie.2024.NUKED.1080p.WEB-DL.DDP5.1.H.264-FLUX",
        },
        {
          "score": 37,
          "title": "Some.Movie.2024.1080p.WEB.AV1-DiRT",
        },
      ]
    `);
  });
});
