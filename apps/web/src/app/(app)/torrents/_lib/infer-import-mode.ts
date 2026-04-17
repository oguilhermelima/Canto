export type ImportMatchMode = "movie" | "series" | "episode";

export function inferImportModeFromName(name: string): ImportMatchMode {
  if (/s\d{1,2}e\d{1,2}/i.test(name)) return "episode";
  if (/season|temporada/i.test(name)) return "series";
  return "movie";
}
