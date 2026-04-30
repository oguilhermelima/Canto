import path from "node:path";

import type { Database } from "@canto/db/client";
import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import { buildMediaDir } from "@canto/core/domain/shared/rules/naming";
import { EP_PATTERN } from "@canto/core/domain/torrents/rules/parsing";
import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import { makeNotificationsRepository } from "@canto/core/infra/notifications/notifications-repository.adapter";
import {
  type ParsedFile,
  buildSubtitleName,
} from "@canto/core/platform/fs/filesystem";
import { upsertMediaFile } from "@canto/core/domain/torrents/use-cases/import-torrent/shared";

interface MediaNaming {
  title: string;
  year: number | null;
  externalId: number;
  provider: string;
  type: string;
}

export async function importLocalVideoFiles(
  parsedFiles: ParsedFile[],
  savePath: string,
  targetDir: string,
  libraryPath: string,
  mediaNaming: MediaNaming,
  primarySeasonNumber: number | undefined,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  db: Database,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
  fs: FileSystemPort,
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
    if (pf.seasonNumber !== undefined && pf.seasonNumber !== primarySeasonNumber) {
      seasonsToCreate.add(pf.seasonNumber);
    }
  }
  for (const seasonNum of seasonsToCreate) {
    const altMediaDir = buildMediaDir(mediaNaming, seasonNum);
    const dir = path.join(libraryPath, altMediaDir);
    try {
      await fs.mkdir(dir, { recursive: true });
      altSeasonDirs.set(seasonNum, dir);
    } catch (mkErr) {
      const code = (mkErr as NodeJS.ErrnoException).code;
      console.error(
        `[auto-import] mkdir failed for "${dir}" (${code}) — files for season ${seasonNum} will be skipped`,
      );
      // Leave altSeasonDirs[seasonNum] unset so the loop below skips files
      // targeting this season (preserves prior throw-then-skip semantics).
    }
  }

  for (const pf of parsedFiles) {
    try {
      let fileTargetDir = targetDir;
      if (pf.seasonNumber !== undefined && pf.seasonNumber !== primarySeasonNumber) {
        const cached = altSeasonDirs.get(pf.seasonNumber);
        if (!cached) {
          // mkdir failed for this season; skip the file (matches previous
          // behavior where mkErr was rethrown and caught by the outer
          // try/catch as a per-file error).
          console.error(
            `[auto-import] Skipping "${pf.file.name}" — alt-season dir was not created`,
          );
          continue;
        }
        fileTargetDir = cached;
      }

      const sourcePath = path.join(savePath, pf.file.name);
      const targetPath = path.join(fileTargetDir, pf.targetFilename);

      if (!linkedPaths.has(targetPath)) {
        const method = await fs.hardlinkOrCopy(sourcePath, targetPath);
        console.log(`[auto-import] ${method}: ${sourcePath} → ${targetPath}`);
        linkedPaths.add(targetPath);

        if (method === "copy" && !crossFsNotified) {
          crossFsNotified = true;
          const notificationsRepo = makeNotificationsRepository(db);
          const existing = await notificationsRepo.findByTypeAndMedia(
            "cross_filesystem_warning",
            mediaRow.id,
          );
          if (!existing) {
            await createNotification(
              { repo: notificationsRepo },
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

      importedCount += await upsertMediaFile(db, pf, targetPath, placeholders, alreadyImported, mediaRow, torrentRow);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.error(
        `[auto-import] File error "${pf.file.name}"${code ? ` (${code})` : ""}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return importedCount;
}

export async function importLocalSubtitleFiles(
  subtitleFiles: Array<{ name: string; size: number }>,
  savePath: string,
  targetDir: string,
  libraryPath: string,
  mediaRow: { type: string },
  mediaNaming: MediaNaming,
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
  fs: FileSystemPort,
): Promise<void> {
  for (const sf of subtitleFiles) {
    try {
      const targetSubName = buildSubtitleName(sf.name, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);
      if (targetSubName) {
        let fileTargetDir = targetDir;
        if (mediaRow.type === "show") {
          const epMatch = EP_PATTERN.exec(sf.name);
          if (epMatch) {
            const subSeasonNum = parseInt(epMatch[1]!, 10);
            if (subSeasonNum !== primarySeasonNumber) {
              const altMediaDir = buildMediaDir(mediaNaming, subSeasonNum);
              fileTargetDir = path.join(libraryPath, altMediaDir);
              await fs.mkdir(fileTargetDir, { recursive: true });
            }
          }
        }

        const sourcePath = path.join(savePath, sf.name);
        const targetPath = path.join(fileTargetDir, targetSubName);
        const method = await fs.hardlinkOrCopy(sourcePath, targetPath);
        console.log(`[auto-import] Subtitle ${method}: ${sf.name} → ${targetSubName}`);
      }
    } catch {
      // Non-critical
    }
  }
}
