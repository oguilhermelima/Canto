export type Flavor = "movie" | "show" | "anime";
export type Quality = "uhd" | "fullhd" | "hd" | "sd";
export type Source = "remux" | "bluray" | "webdl" | "webrip" | "hdtv";

export interface AllowedFormat {
  quality: Quality;
  source: Source;
  weight: number;
}

export interface ProfileRow {
  id: string;
  name: string;
  flavor: string;
  allowedFormats: AllowedFormat[];
  cutoffQuality: string | null;
  cutoffSource: string | null;
  minTotalScore: number;
  languages: string[];
  languageStrict: boolean;
  isDefault: boolean;
}

export interface ProfileDraft {
  id?: string;
  name: string;
  flavor: Flavor;
  allowedFormats: AllowedFormat[];
  cutoffQuality: Quality | null;
  cutoffSource: Source | null;
  minTotalScore: number;
  languages: string[];
  languageStrict: boolean;
}

export const FLAVORS: readonly Flavor[] = ["movie", "show", "anime"] as const;

export const FLAVOR_LABELS: Record<Flavor, string> = {
  movie: "Movies",
  show: "Shows",
  anime: "Anime",
};

export const QUALITY_OPTIONS: ReadonlyArray<{ value: Quality; label: string }> =
  [
    { value: "uhd", label: "4K / UHD" },
    { value: "fullhd", label: "1080p" },
    { value: "hd", label: "720p" },
    { value: "sd", label: "SD" },
  ];

export const SOURCE_OPTIONS: ReadonlyArray<{ value: Source; label: string }> = [
  { value: "remux", label: "Remux" },
  { value: "bluray", label: "Bluray" },
  { value: "webdl", label: "WEB-DL" },
  { value: "webrip", label: "WEBRip" },
  { value: "hdtv", label: "HDTV" },
];

export const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  flavor: "movie",
  allowedFormats: [{ quality: "fullhd", source: "bluray", weight: 40 }],
  cutoffQuality: null,
  cutoffSource: null,
  minTotalScore: 0,
  languages: [],
  languageStrict: false,
};

export const DEFAULT_FORMAT_ROW: AllowedFormat = {
  quality: "fullhd",
  source: "webdl",
  weight: 30,
};

export function formatLabel(quality: Quality, source: Source): string {
  const ql = QUALITY_OPTIONS.find((o) => o.value === quality)?.label ?? quality;
  const sl = SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
  return `${ql} ${sl}`;
}

export function createEmptyDraft(flavor: Flavor): ProfileDraft {
  return {
    ...EMPTY_DRAFT,
    flavor,
    allowedFormats: EMPTY_DRAFT.allowedFormats.map((f) => ({ ...f })),
  };
}

export function profileRowToDraft(p: ProfileRow): ProfileDraft {
  return {
    id: p.id,
    name: p.name,
    flavor: p.flavor as Flavor,
    allowedFormats: p.allowedFormats.map((f) => ({
      quality: f.quality,
      source: f.source,
      weight: f.weight,
    })),
    cutoffQuality: (p.cutoffQuality as Quality | null) ?? null,
    cutoffSource: (p.cutoffSource as Source | null) ?? null,
    minTotalScore: p.minTotalScore,
    languages: p.languages,
    languageStrict: p.languageStrict,
  };
}
