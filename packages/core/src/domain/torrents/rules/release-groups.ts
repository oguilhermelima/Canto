/**
 * Curated release-group tiers, inspired by the TRaSH guides.
 *
 * Movies, shows and anime use disjoint conventions, so we publish three
 * lists and dispatch on a {@link ReleaseFlavor} computed from the media
 * row. Inside each flavor, the tiers express how confident we are in the
 * group:
 *
 *   - tier1   — top-shelf encoders / WEB rippers. The release will be a
 *               near-source-quality master.
 *   - tier2   — solid groups. A safe pick when no tier1 is available.
 *   - tier3   — competent but heterogeneous: tagging variance is high
 *               and quality less consistent.
 *   - neutral — group not on any list (default). No score adjustment.
 *   - avoid   — known low-quality re-encoders / scene throwaway groups.
 *               TRaSH treats these as "should never win unless nothing
 *               else exists".
 *
 * Lookups are case-insensitive.
 */

export type ReleaseGroupTier =
  | "tier1"
  | "tier2"
  | "tier3"
  | "neutral"
  | "avoid";

export type ReleaseFlavor = "movie" | "show" | "anime";

interface FlavorTiers {
  tier1: string[];
  tier2: string[];
  tier3: string[];
  avoid: string[];
}

/* ── Movies ── */
const MOVIE_TIERS: FlavorTiers = {
  tier1: [
    // HQ BluRay / Remux encoders
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
    // HQ WEB-DL ripping groups
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
    // Mid / less-consistent groups
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

/* ── Shows ── */
const SHOW_TIERS: FlavorTiers = {
  tier1: [
    // HQ WEB groups for series
    "FLUX",
    "NTb",
    "CMRG",
    "RAWR",
    "MIXED",
    "ETHiCS",
    "KOGi",
    "EBI",
    "REWARD",
  ],
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

/* ── Anime ── */
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
  avoid: [
    "HorribleRips",
    "EMBER",
    "AnimeKaizoku",
    "AniDLAnime",
    "Judas",
    "Pog",
  ],
};

const TIERS_BY_FLAVOR: Record<ReleaseFlavor, FlavorTiers> = {
  movie: MOVIE_TIERS,
  show: SHOW_TIERS,
  anime: ANIME_TIERS,
};

/**
 * Pre-build case-insensitive lookup sets once at module load. Reading the
 * lists in their original casing keeps them maintainable; lookups use the
 * lowered form so we never miss "yts" vs "YTS" mismatches.
 */
const LOOKUPS = (() => {
  const result = {} as Record<
    ReleaseFlavor,
    Record<Exclude<ReleaseGroupTier, "neutral">, Set<string>>
  >;
  for (const flavor of Object.keys(TIERS_BY_FLAVOR) as ReleaseFlavor[]) {
    const src = TIERS_BY_FLAVOR[flavor];
    result[flavor] = {
      tier1: new Set(src.tier1.map((g) => g.toLowerCase())),
      tier2: new Set(src.tier2.map((g) => g.toLowerCase())),
      tier3: new Set(src.tier3.map((g) => g.toLowerCase())),
      avoid: new Set(src.avoid.map((g) => g.toLowerCase())),
    };
  }
  return result;
})();

/**
 * Classify a release group within the context of a media flavor. Movies,
 * shows and anime have disjoint group conventions, so the same group name
 * can fall in different tiers (e.g. NTb is shows-tier1 + movies-tier1 but
 * absent from anime).
 */
export function classifyReleaseGroup(
  group: string | null,
  flavor: ReleaseFlavor,
): ReleaseGroupTier {
  if (!group) return "neutral";
  const g = group.toLowerCase();
  const lookup = LOOKUPS[flavor];
  if (lookup.tier1.has(g)) return "tier1";
  if (lookup.tier2.has(g)) return "tier2";
  if (lookup.tier3.has(g)) return "tier3";
  if (lookup.avoid.has(g)) return "avoid";
  return "neutral";
}
