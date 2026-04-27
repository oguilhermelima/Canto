/**
 * Curated release group tiers, inspired by the TRaSH guides.
 *
 * - "gold"    — known high-quality encoders / WEB-DL ripping groups
 * - "avoid"   — known low-quality re-encoders, scene throwaway groups
 * - "neutral" — anything not on either list (no score adjustment)
 *
 * Comparisons are case-insensitive.
 */

export type ReleaseGroupTier = "gold" | "avoid" | "neutral";

const GOLD_GROUPS = new Set<string>([
  // HQ BluRay encoders (movies + shows)
  "BMF",
  "BHDStudio",
  "CtrlHD",
  "DON",
  "EbP",
  "EPSiLON",
  "FraMeSToR",
  "HiDt",
  "HiSD",
  "KRaLiMaRKo",
  "NCmt",
  "NTb",
  "PmP",
  "SiCFoI",
  "SiGMA",
  "TayTO",
  "TDD",
  "ZQ",
  "decibeL",
  "beAst",
  // HQ WEB-DL ripping groups (movies + shows)
  "ABBIE",
  "AJP69",
  "APEX",
  "BLUTONiUM",
  "CMRG",
  "CRFW",
  "CRUD",
  "FLUX",
  "GNOME",
  "HONE",
  "KiNGS",
  "Kitsune",
  "KOGi",
  "MIXED",
  "MZABI",
  "NOSiViD",
  "NTG",
  "QOQ",
  "RAWR",
  "ROCCaT",
  "RTN",
  "SIC",
  "TEPES",
  "TOMMY",
  "ViSUM",
  "dB",
  "GLHF",
  "ETHiCS",
  "EBI",
  "REWARD",
  "monkee",
  "BTN",
  // Anime HQ
  "Vodes",
  "Kulot",
  "LostYears",
  "Koi",
  "MTBB",
]);

const AVOID_GROUPS = new Set<string>([
  // Known LQ / scene re-encoders / repackagers
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
]);

// Build a lowercase lookup once at module load.
const GOLD_LOWER = new Set([...GOLD_GROUPS].map((g) => g.toLowerCase()));
const AVOID_LOWER = new Set([...AVOID_GROUPS].map((g) => g.toLowerCase()));

export function classifyReleaseGroup(group: string | null): ReleaseGroupTier {
  if (!group) return "neutral";
  const g = group.toLowerCase();
  if (GOLD_LOWER.has(g)) return "gold";
  if (AVOID_LOWER.has(g)) return "avoid";
  return "neutral";
}
