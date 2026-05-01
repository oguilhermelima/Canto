import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { buildFileName } from "@canto/core/domain/shared/rules/naming";
import {
  BARE_EP_PATTERN,
  EP_PATTERN,
  parseFileEpisodes,
  parseSubtitleLanguage,
} from "@canto/core/domain/torrents/rules/parsing";

export interface ParsedFile {
  /** Original file info from client */
  file: { name: string; size: number };
  /** Parsed season number */
  seasonNumber: number | undefined;
  /** Parsed episode number */
  episodeNumber: number | undefined;
  /** Resolved episode ID from DB */
  episodeId: string | undefined;
  /** Target filename after rename */
  targetFilename: string;
  /** File extension */
  extension: string;
}

/**
 * Parse video files: extract episode info, resolve IDs, build target filenames.
 * Pure helper — no I/O.
 */
export function parseVideoFiles(
  videoFiles: Array<{ name: string; size: number }>,
  mediaRow: {
    type: string;
    seasons?: Array<{
      number: number;
      episodes?: Array<{ id: string; number: number; title: string | null }>;
    }>;
  },
  mediaNaming: {
    title: string;
    year: number | null;
    externalId: number;
    provider: string;
    type: string;
  },
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
  logger?: LoggerPort,
): ParsedFile[] {
  const results: ParsedFile[] = [];

  for (const vf of videoFiles) {
    const ext = vf.name.substring(vf.name.lastIndexOf("."));

    if (mediaRow.type === "show") {
      const parsed = parseFileEpisodes(vf.name);
      const seasonNumber = parsed.season ?? primarySeasonNumber;

      if (parsed.episodes.length === 0) {
        logger?.warn(
          `[auto-import] Skipping "${vf.name}" — no episode number detected for show`,
        );
        continue;
      }

      const firstEp = parsed.episodes[0];
      if (firstEp === undefined) continue;

      const matchedSeason =
        seasonNumber !== undefined
          ? mediaRow.seasons?.find((s) => s.number === seasonNumber)
          : undefined;

      for (const epNum of parsed.episodes) {
        const matchedEp = matchedSeason?.episodes?.find(
          (e) => e.number === epNum,
        );

        if (!matchedEp) {
          logger?.warn(
            `[auto-import] Skipping S${String(seasonNumber ?? 0).padStart(2, "0")}E${String(epNum).padStart(2, "0")} — episode not found in database`,
          );
          continue;
        }

        const targetFilename = buildFileName(mediaNaming, {
          seasonNumber,
          episodeNumber: firstEp,
          episodeTitle:
            matchedSeason?.episodes?.find((e) => e.number === firstEp)?.title ??
            undefined,
          quality: torrentRow.quality,
          source: torrentRow.source,
          torrentTitle: torrentRow.title,
          extension: ext,
        });

        results.push({
          file: vf,
          seasonNumber,
          episodeNumber: epNum,
          episodeId: matchedEp.id,
          targetFilename,
          extension: ext,
        });
      }
    } else {
      results.push({
        file: vf,
        seasonNumber: undefined,
        episodeNumber: undefined,
        episodeId: undefined,
        targetFilename: buildFileName(mediaNaming, {
          quality: torrentRow.quality,
          source: torrentRow.source,
          torrentTitle: torrentRow.title,
          extension: ext,
        }),
        extension: ext,
      });
    }
  }

  return results;
}

export function buildSubtitleName(
  fileName: string,
  mediaRow: { type: string },
  mediaNaming: {
    title: string;
    year: number | null;
    externalId: number;
    provider: string;
    type: string;
  },
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
): string | undefined {
  const lang = parseSubtitleLanguage(fileName);
  const subExt = fileName.substring(fileName.lastIndexOf("."));
  const langSuffix = lang ? `.${lang}` : "";

  if (mediaRow.type === "show") {
    const epMatch = EP_PATTERN.exec(fileName);
    const bareMatch = epMatch ? null : BARE_EP_PATTERN.exec(fileName);
    const match = epMatch ?? bareMatch;
    if (!match) return undefined;

    const epRaw = epMatch ? match[2] : match[1];
    if (epRaw === undefined) return undefined;
    const epNum = parseInt(epRaw, 10);

    const seasonRaw = epMatch ? epMatch[1] : undefined;
    const sNum =
      seasonRaw !== undefined ? parseInt(seasonRaw, 10) : primarySeasonNumber;

    return buildFileName(mediaNaming, {
      seasonNumber: sNum,
      episodeNumber: epNum,
      quality: torrentRow.quality,
      source: torrentRow.source,
      torrentTitle: torrentRow.title,
      extension: `${langSuffix}${subExt}`,
    });
  }

  return buildFileName(mediaNaming, {
    quality: torrentRow.quality,
    source: torrentRow.source,
    torrentTitle: torrentRow.title,
    extension: `${langSuffix}${subExt}`,
  });
}
