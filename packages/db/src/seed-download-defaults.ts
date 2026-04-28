import type { Database } from "./client";
import { downloadConfig, downloadReleaseGroup } from "./schema";

/**
 * Default scoring rules — TRaSH-aligned weights mirroring the canonical
 * shape consumed by `calculateConfidence` in `@canto/core`.
 *
 * This blob is the single source of truth at runtime once the seed runs:
 * core no longer ships hardcoded defaults. Update here and re-run the
 * seed (idempotent for the table, but `ON CONFLICT DO NOTHING` keeps
 * existing rows untouched — admins editing the row from the UI won't
 * have their changes stomped on next deploy).
 */
const DEFAULT_SCORING_RULES = {
  health: [
    { threshold: 500, bonus: 40 },
    { threshold: 100, bonus: 35 },
    { threshold: 50, bonus: 30 },
    { threshold: 20, bonus: 25 },
    { threshold: 10, bonus: 20 },
    { threshold: 5, bonus: 15 },
    { threshold: 1, bonus: 8 },
  ],
  freshness: [
    { threshold: 1, bonus: 10 },
    { threshold: 7, bonus: 8 },
    { threshold: 30, bonus: 5 },
    { threshold: 90, bonus: 3 },
    { threshold: 365, bonus: 1 },
  ],
  quality: { uhd: 30, fullhd: 25, hd: 15, sd: 5, unknown: 0 },
  source: {
    remux: 15,
    bluray: 12,
    webdl: 10,
    webrip: 7,
    hdtv: 5,
    telesync: -20,
    cam: -40,
    unknown: 0,
  },
  allowedFormats: null,
  hdr: { "DV-HDR10": 13, DV: 12, "HDR10+": 10, HDR10: 8, HDR: 8, HLG: 3 },
  audioCodec: {
    "TrueHD Atmos": 10,
    "DTS-HD MA": 9,
    TrueHD: 8,
    "DTS-HD": 7,
    DTS: 5,
    FLAC: 4,
    EAC3: 3,
    AC3: 2,
    AAC: 1,
  },
  audioChannels: { "7.1": 3, "5.1": 2, "2.0": 0, "1.0": 0 },
  groupTier: { tier1: 12, tier2: 8, tier3: 5, neutral: 0, avoid: -40 },
  codec: {
    byQuality: {
      uhd: { h265: 12, av1: 10, h264: 4 },
      default: { h264: 10, av1: 8 },
    },
  },
  languageBonuses: {},
  streamingServiceBonuses: {
    NF: 1,
    AMZN: 1,
    ATVP: 1,
    DSNP: 1,
    HMAX: 1,
    HULU: 1,
    PCOK: 1,
    STAN: 1,
    PMTP: 1,
    CR: 1,
  },
  editionBonuses: {},
  flags: {
    exclusive: [
      { flag: "freeleech", bonus: 5 },
      { flag: "freeleech75", bonus: 4 },
      { flag: "halfleech", bonus: 3 },
      { flag: "freeleech25", bonus: 2 },
    ],
    additive: { doubleupload: 2, nuked: -100 },
  },
  multiAudioToken: 2,
  multipleLanguagesBonus: 1,
  hybridBonus: 3,
  repackPerCount: 3,
  repackMaxBonus: 6,
  comboUhdRemuxDvAtmos: 5,
  uhdNoHdrPenalty: -10,
  camWithDigitalPenalty: -80,
  camNoDigitalPenalty: -15,
  preferenceBonuses: {
    perPreferredLanguage: 4,
    perPreferredStreamingService: 3,
    preferredEdition: 2,
    avoidedEdition: -3,
    av1Stance: 5,
  },
  maxRaw: 170,
  minTotalScore: 0,
  requiredLanguages: null,
};

type Flavor = "movie" | "show" | "anime";
type Tier = "tier1" | "tier2" | "tier3" | "avoid";
interface FlavorTiers {
  tier1: string[];
  tier2: string[];
  tier3: string[];
  avoid: string[];
}

const MOVIE_TIERS: FlavorTiers = {
  tier1: [
    "FLUX",
    "NTb",
    "BMF",
    "DON",
    "EbP",
    "CtrlHD",
    "BHDStudio",
    "FraMeSToR",
    "ZQ",
    "decibeL",
    "EPSiLON",
    "KRaLiMaRKo",
    "NCmt",
    "PmP",
    "SiCFoI",
    "TayTO",
    "beAst",
  ],
  tier2: [
    "ABBIE",
    "AJP69",
    "APEX",
    "BLUTONiUM",
    "CMRG",
    "CRFW",
    "GNOME",
    "HONE",
    "KiNGS",
    "MIXED",
    "MZABI",
    "NOSiViD",
    "NTG",
    "RAWR",
    "SIC",
    "TEPES",
    "TOMMY",
    "dB",
  ],
  tier3: [
    "ROCCaT",
    "KOGi",
    "GLHF",
    "ETHiCS",
    "Kitsune",
    "QOQ",
    "RTN",
    "ViSUM",
    "HiDt",
    "HiSD",
    "SiGMA",
    "TDD",
    "monkee",
  ],
  avoid: [
    "aXXo",
    "CM8",
    "CrEwSaDe",
    "FGT",
    "FRDS",
    "FZHD",
    "GalaxyRG",
    "GalaxyTV",
    "HDTime",
    "ION10",
    "mHD",
    "mSD",
    "NhaNc3",
    "nHD",
    "OFT",
    "PSA",
    "RARBG",
    "RDN",
    "SANTi",
    "STUTTERSHIT",
    "TERMiNAL",
    "ViSiON",
    "ViSION",
    "WAF",
    "WORLD",
    "x0r",
    "YIFY",
    "YTS",
    "EVO",
    "ETRG",
    "FaiLED",
    "FUM",
    "JFF",
    "ReEnc0d3d",
    "RPG",
    "SAMPA",
    "8FLiX",
    "AOC",
    "ELEVATE",
    "ELiTE",
    "NTRG",
  ],
};

const SHOW_TIERS: FlavorTiers = {
  tier1: ["FLUX", "NTb", "CMRG", "RAWR", "MIXED", "ETHiCS", "KOGi", "EBI", "REWARD"],
  tier2: [
    "GLHF",
    "MZABI",
    "NTG",
    "ROCCaT",
    "monkee",
    "BTN",
    "KiNGS",
    "NOSiViD",
    "dB",
    "TOMMY",
    "CRUD",
    "TEPES",
  ],
  tier3: [
    "ViSUM",
    "AJP69",
    "APEX",
    "ABBIE",
    "HONE",
    "GNOME",
    "BLUTONiUM",
    "Kitsune",
    "SIC",
    "QOQ",
    "RTN",
  ],
  avoid: [
    "8FLiX",
    "AOC",
    "ELEVATE",
    "ELiTE",
    "ETRG",
    "EVO",
    "FaiLED",
    "FUM",
    "ION10",
    "JFF",
    "mSD",
    "NTRG",
    "NhaNc3",
    "OFT",
    "PSA",
    "RARBG",
    "RPG",
    "ReEnc0d3d",
    "SAMPA",
    "TERMiNAL",
    "ViSION",
    "WAF",
    "x0r",
    "YIFY",
    "YTS",
    "FGT",
    "GalaxyTV",
    "GalaxyRG",
  ],
};

const ANIME_TIERS: FlavorTiers = {
  tier1: ["Vodes", "Kulot", "MTBB", "LostYears", "Koi"],
  tier2: [
    "ASW",
    "BlurayDesuYo",
    "fairy0",
    "GHOST",
    "Hark0n",
    "neoHEVC",
    "ToonsHub",
    "Yameii",
  ],
  tier3: [
    "SubsPlease",
    "SubsPlus+",
    "Erai-raws",
    "HorribleSubs",
    "Cyan",
    "Spirale",
    "WBDP",
  ],
  avoid: ["HorribleRips", "EMBER", "AnimeKaizoku", "AniDLAnime", "Judas", "Pog"],
};

const TIER_LISTS: Record<Flavor, FlavorTiers> = {
  movie: MOVIE_TIERS,
  show: SHOW_TIERS,
  anime: ANIME_TIERS,
};

/**
 * Idempotent seed for download admin tables.
 *
 * `download_config`: inserts the default scoring rule blob if no row
 * exists. Existing rows are left alone — admins editing the config from
 * the UI don't get their changes overwritten on the next boot.
 *
 * `download_release_group`: per-row upsert of the canonical TRaSH tier
 * lists. Existing rows are not overwritten so per-instance custom
 * overrides persist (the future Phase 6 admin UI will expose them).
 */
export async function seedDownloadDefaults(db: Database): Promise<void> {
  const existing = await db.query.downloadConfig.findFirst();
  if (!existing) {
    await db.insert(downloadConfig).values({
      scoringRules: DEFAULT_SCORING_RULES,
    });
  }

  for (const flavor of Object.keys(TIER_LISTS) as Flavor[]) {
    const tiers = TIER_LISTS[flavor];
    for (const tier of ["tier1", "tier2", "tier3", "avoid"] as Tier[]) {
      for (const name of tiers[tier]) {
        await db
          .insert(downloadReleaseGroup)
          .values({
            nameLower: name.toLowerCase(),
            flavor,
            tier,
            displayName: name,
          })
          .onConflictDoNothing();
      }
    }
  }
}

/** Re-export for tests / repository layer that need the canonical default
 *  blob without round-tripping through the DB. */
export const DEFAULT_DOWNLOAD_SCORING_RULES = DEFAULT_SCORING_RULES;
