import {
  access,
  constants,
  copyFile,
  link,
  mkdir,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";

import type {
  FileAccessMode,
  FileSystemPort,
  HardlinkOrCopyResult,
} from "../../domain/shared/ports/file-system.port";
import { buildFileName } from "../../domain/shared/rules/naming";
import {
  BARE_EP_PATTERN,
  EP_PATTERN,
  parseFileEpisodes,
  parseSubtitleLanguage,
} from "../../domain/torrents/rules/parsing";

async function safeCopy(source: string, target: string): Promise<void> {
  try {
    await copyFile(source, target);
  } catch (cpErr) {
    // Clean up orphaned partial copy before rethrowing so retries start clean.
    await unlink(target).catch(() => undefined);
    throw cpErr;
  }
}

async function hardlinkOrCopy(
  source: string,
  target: string,
): Promise<HardlinkOrCopyResult> {
  try {
    await link(source, target);

    // Verify the hardlink actually shares the same inode (Docker/NFS can fail silently)
    const [srcStat, tgtStat] = await Promise.all([stat(source), stat(target)]);
    if (srcStat.ino !== tgtStat.ino) {
      await safeCopy(source, target);
      return "copy";
    }

    return "hardlink";
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      // Target already exists. Only accept it if size matches source —
      // otherwise it's stale from a prior failed import and must be replaced.
      try {
        const [srcStat, tgtStat] = await Promise.all([
          stat(source),
          stat(target),
        ]);
        if (srcStat.size === tgtStat.size) return "exists";
        await unlink(target);
      } catch {
        throw err;
      }
      return hardlinkOrCopy(source, target);
    }
    if (code === "EXDEV" || code === "EPERM" || code === "ENOTSUP") {
      // Cross-filesystem or filesystem without hardlink support (FAT32, SMB) — copy instead.
      try {
        await safeCopy(source, target);
        return "copy";
      } catch (cpErr: unknown) {
        if ((cpErr as NodeJS.ErrnoException).code === "EEXIST") return "exists";
        throw cpErr;
      }
    }
    throw err;
  }
}

const ACCESS_MODE: Record<FileAccessMode, number> = {
  read: constants.R_OK,
  write: constants.W_OK,
  "read-write": constants.R_OK | constants.W_OK,
};

export function createNodeFileSystemAdapter(): FileSystemPort {
  return {
    mkdir: async (dirPath, opts) => {
      await mkdir(dirPath, opts ?? {});
    },
    rmdir: async (dirPath) => {
      await rmdir(dirPath);
    },
    rename: async (source, target) => {
      await rename(source, target);
    },
    readdir: async (dirPath) => {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));
    },
    stat: async (targetPath) => {
      const info = await stat(targetPath);
      return {
        isDirectory: info.isDirectory(),
        isFile: info.isFile(),
        size: info.size,
      };
    },
    access: async (targetPath, mode) => {
      await access(targetPath, ACCESS_MODE[mode]);
    },
    hardlinkOrCopy,
  };
}

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
 * Pure helper — no I/O. Co-located with the FS adapter because every caller
 * pairs the parsed output with the adapter's hardlink/copy operations.
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
): ParsedFile[] {
  const results: ParsedFile[] = [];

  for (const vf of videoFiles) {
    const ext = vf.name.substring(vf.name.lastIndexOf("."));

    if (mediaRow.type === "show") {
      const parsed = parseFileEpisodes(vf.name);
      const seasonNumber = parsed.season ?? primarySeasonNumber;

      if (parsed.episodes.length > 0) {
        // For each episode in the file, create a ParsedFile entry.
        // All entries share the same physical file but target different episode IDs.
        // Use the first episode number for the filename (e.g., S01E01-E03 style).
        const firstEp = parsed.episodes[0]!;
        const matchedSeason =
          seasonNumber !== undefined
            ? mediaRow.seasons?.find((s) => s.number === seasonNumber)
            : undefined;

        for (const epNum of parsed.episodes) {
          const matchedEp = matchedSeason?.episodes?.find(
            (e) => e.number === epNum,
          );

          if (!matchedEp) {
            console.warn(
              `[auto-import] Skipping S${String(seasonNumber ?? 0).padStart(2, "0")}E${String(epNum).padStart(2, "0")} — episode not found in database`,
            );
            continue;
          }

          // Only the first episode gets the actual filename; others share the same file
          const targetFilename = buildFileName(mediaNaming, {
            seasonNumber,
            episodeNumber: firstEp,
            episodeTitle:
              matchedSeason?.episodes?.find((e) => e.number === firstEp)
                ?.title ?? undefined,
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
        console.warn(
          `[auto-import] Skipping "${vf.name}" — no episode number detected for show`,
        );
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
    const bareMatch = !epMatch ? BARE_EP_PATTERN.exec(fileName) : null;
    const match = epMatch ?? bareMatch;
    if (match) {
      const epNum = parseInt(epMatch ? match[2]! : match[1]!, 10);
      const sNum = epMatch
        ? parseInt(epMatch[1]!, 10)
        : primarySeasonNumber;
      return buildFileName(mediaNaming, {
        seasonNumber: sNum,
        episodeNumber: epNum,
        quality: torrentRow.quality,
        source: torrentRow.source,
        torrentTitle: torrentRow.title,
        extension: `${langSuffix}${subExt}`,
      });
    }
    return undefined;
  }

  return buildFileName(mediaNaming, {
    quality: torrentRow.quality,
    source: torrentRow.source,
    torrentTitle: torrentRow.title,
    extension: `${langSuffix}${subExt}`,
  });
}
