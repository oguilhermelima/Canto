import type { ImportMatchMode } from "./infer-import-mode";
import { parseEpisodeNumbers } from "./parse-episode-numbers";

export type DownloadType = "movie" | "season" | "episode";

export interface ResolvedImportInput {
  downloadType: DownloadType;
  seasonNumber?: number;
  episodeNumbers?: number[];
}

export type ImportInputResult =
  | { ok: true; value: ResolvedImportInput }
  | { ok: false; error: string };

export function resolveImportInput(
  mode: ImportMatchMode,
  seasonInput: string,
  episodeInput: string,
): ImportInputResult {
  const downloadType: DownloadType =
    mode === "movie" ? "movie" : mode === "series" ? "season" : "episode";

  if (mode === "movie") return { ok: true, value: { downloadType } };

  const parsedSeason = Number(seasonInput);

  if (mode === "series") {
    if (!seasonInput.trim()) return { ok: true, value: { downloadType } };
    if (!Number.isInteger(parsedSeason) || parsedSeason <= 0) {
      return { ok: false, error: "Season must be a positive number" };
    }
    return { ok: true, value: { downloadType, seasonNumber: parsedSeason } };
  }

  if (!Number.isInteger(parsedSeason) || parsedSeason <= 0) {
    return { ok: false, error: "Season must be a positive number" };
  }
  const parsedEpisodes = parseEpisodeNumbers(episodeInput);
  if (parsedEpisodes.length === 0) {
    return { ok: false, error: "Enter at least one episode number" };
  }
  return {
    ok: true,
    value: {
      downloadType,
      seasonNumber: parsedSeason,
      episodeNumbers: parsedEpisodes,
    },
  };
}
