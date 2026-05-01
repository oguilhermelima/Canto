import path from "node:path";

import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { buildMediaDir } from "@canto/core/domain/shared/rules/naming";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import { EP_PATTERN } from "@canto/core/domain/torrents/rules/parsing";
import { buildSubtitleName } from "@canto/core/domain/torrents/rules/parse-video-files";
import type { ParsedFile } from "@canto/core/domain/torrents/rules/parse-video-files";
import { upsertMediaFile } from "@canto/core/domain/torrents/use-cases/import-torrent/shared";

interface MediaNaming {
  title: string;
  year: number | null;
  externalId: number;
  provider: string;
  type: string;
}

export interface ImportLocalDeps {
  torrents: TorrentsRepositoryPort;
  notifications: NotificationsRepositoryPort;
  fs: FileSystemPort;
  logger: LoggerPort;
}

export async function importLocalVideoFiles(
  deps: ImportLocalDeps,
  parsedFiles: ParsedFile[],
  savePath: string,
  targetDir: string,
  libraryPath: string,
  mediaNaming: MediaNaming,
  primarySeasonNumber: number | undefined,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
): Promise<number> {
  let importedCount = 0;
  const linkedPaths = new Set<string>();
  let crossFsNotified = false;

  // Pre-compute alt-season directories so multi-season torrents call mkdir
  // once per unique season instead of once per file. The primary season's
  // directory is created by the caller before this function runs.
  const altSeasonDirs = new Map<number, string>();
  const seasonsToCreate = new Set<number>();
  for (const pf of parsedFiles) {
    if (
      pf.seasonNumber !== undefined &&
      pf.seasonNumber !== primarySeasonNumber
    ) {
      seasonsToCreate.add(pf.seasonNumber);
    }
  }
  for (const seasonNum of seasonsToCreate) {
    const altMediaDir = buildMediaDir(mediaNaming, seasonNum);
    const dir = path.join(libraryPath, altMediaDir);
    try {
      await deps.fs.mkdir(dir, { recursive: true });
      altSeasonDirs.set(seasonNum, dir);
    } catch (mkErr) {
      const code = (mkErr as NodeJS.ErrnoException).code;
      deps.logger.error(
        `[auto-import] mkdir failed for "${dir}" (${code ?? "unknown"}) — files for season ${seasonNum} will be skipped`,
      );
    }
  }

  for (const pf of parsedFiles) {
    try {
      let fileTargetDir = targetDir;
      if (
        pf.seasonNumber !== undefined &&
        pf.seasonNumber !== primarySeasonNumber
      ) {
        const cached = altSeasonDirs.get(pf.seasonNumber);
        if (!cached) {
          deps.logger.error(
            `[auto-import] Skipping "${pf.file.name}" — alt-season dir was not created`,
          );
          continue;
        }
        fileTargetDir = cached;
      }

      const sourcePath = path.join(savePath, pf.file.name);
      const targetPath = path.join(fileTargetDir, pf.targetFilename);

      if (!linkedPaths.has(targetPath)) {
        const method = await deps.fs.hardlinkOrCopy(sourcePath, targetPath);
        deps.logger.info?.(
          `[auto-import] ${method}: ${sourcePath} → ${targetPath}`,
        );
        linkedPaths.add(targetPath);

        if (method === "copy" && !crossFsNotified) {
          crossFsNotified = true;
          const existing = await deps.notifications.findByTypeAndMedia(
            "cross_filesystem_warning",
            mediaRow.id,
          );
          if (!existing) {
            await createNotification(
              { repo: deps.notifications },
              {
                title: "Cross-filesystem copy",
                message: `Files are being copied instead of hardlinked (different filesystems). This uses double disk space.`,
                type: "cross_filesystem_warning",
                mediaId: mediaRow.id,
              },
            );
          }
        }
      }

      importedCount += await upsertMediaFile(
        deps.torrents,
        pf,
        targetPath,
        placeholders,
        alreadyImported,
        mediaRow,
        torrentRow,
      );
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      deps.logger.error(
        `[auto-import] File error "${pf.file.name}"${code ? ` (${code})` : ""}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  return importedCount;
}

export async function importLocalSubtitleFiles(
  deps: { fs: FileSystemPort; logger: LoggerPort },
  subtitleFiles: Array<{ name: string; size: number }>,
  savePath: string,
  targetDir: string,
  libraryPath: string,
  mediaRow: { type: string },
  mediaNaming: MediaNaming,
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
): Promise<void> {
  for (const sf of subtitleFiles) {
    try {
      const targetSubName = buildSubtitleName(
        sf.name,
        mediaRow,
        mediaNaming,
        torrentRow,
        primarySeasonNumber,
      );
      if (targetSubName) {
        let fileTargetDir = targetDir;
        if (mediaRow.type === "show") {
          const epMatch = EP_PATTERN.exec(sf.name);
          const seasonRaw = epMatch?.[1];
          if (seasonRaw !== undefined) {
            const subSeasonNum = parseInt(seasonRaw, 10);
            if (subSeasonNum !== primarySeasonNumber) {
              const altMediaDir = buildMediaDir(mediaNaming, subSeasonNum);
              fileTargetDir = path.join(libraryPath, altMediaDir);
              await deps.fs.mkdir(fileTargetDir, { recursive: true });
            }
          }
        }

        const sourcePath = path.join(savePath, sf.name);
        const targetPath = path.join(fileTargetDir, targetSubName);
        const method = await deps.fs.hardlinkOrCopy(sourcePath, targetPath);
        deps.logger.info?.(
          `[auto-import] Subtitle ${method}: ${sf.name} → ${targetSubName}`,
        );
      }
    } catch {
      // Non-critical
    }
  }
}
