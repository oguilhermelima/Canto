import path from "node:path";

import type { Database } from "@canto/db/client";
import type { FileSystemPort } from "../../../shared/ports/file-system.port";
import { buildMediaDir } from "../../../shared/rules/naming";
import { EP_PATTERN } from "../../../torrents/rules/parsing";
import { createNotification } from "../../notifications/create-notification";
import { findNotificationByTypeAndMedia } from "../../../../infra/repositories";
import {
  type ParsedFile,
  buildSubtitleName,
} from "../../../../platform/fs/filesystem";
import { upsertMediaFile } from "./shared";

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

  for (const pf of parsedFiles) {
    try {
      let fileTargetDir = targetDir;
      if (pf.seasonNumber !== undefined && pf.seasonNumber !== primarySeasonNumber) {
        const altMediaDir = buildMediaDir(mediaNaming, pf.seasonNumber);
        fileTargetDir = path.join(libraryPath, altMediaDir);
        try {
          await fs.mkdir(fileTargetDir, { recursive: true });
        } catch (mkErr) {
          const code = (mkErr as NodeJS.ErrnoException).code;
          console.error(
            `[auto-import] mkdir failed for "${fileTargetDir}" (${code}) — file "${pf.file.name}" will be skipped`,
          );
          throw mkErr;
        }
      }

      const sourcePath = path.join(savePath, pf.file.name);
      const targetPath = path.join(fileTargetDir, pf.targetFilename);

      if (!linkedPaths.has(targetPath)) {
        const method = await fs.hardlinkOrCopy(sourcePath, targetPath);
        console.log(`[auto-import] ${method}: ${sourcePath} → ${targetPath}`);
        linkedPaths.add(targetPath);

        if (method === "copy" && !crossFsNotified) {
          crossFsNotified = true;
          const existing = await findNotificationByTypeAndMedia(db, "cross_filesystem_warning", mediaRow.id);
          if (!existing) {
            await createNotification(db, {
              title: "Cross-filesystem copy",
              message: `Files are being copied instead of hardlinked (different filesystems). This uses double disk space.`,
              type: "cross_filesystem_warning",
              mediaId: mediaRow.id,
            });
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
