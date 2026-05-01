import path from "node:path";

import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import { MS_PER_MINUTE } from "@canto/core/domain/shared/constants";
import type {
  DownloadClientPort,
  TorrentFileInfo,
} from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
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

export interface ImportRemoteVideoFilesResult {
  importedCount: number;
  postMoveFiles: TorrentFileInfo[];
}

export interface ImportRemoteDeps {
  client: DownloadClientPort;
  notifications: NotificationsRepositoryPort;
  torrents: TorrentsRepositoryPort;
  logger: LoggerPort;
}

const MAX_MOVE_MS = 30 * MS_PER_MINUTE;
const POLL_INTERVAL_MS = 3000;

export async function importRemoteVideoFiles(
  deps: ImportRemoteDeps,
  parsedFiles: ParsedFile[],
  hash: string,
  qbitTargetLocation: string,
  libraryTargetLocation: string,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
  originalFiles: TorrentFileInfo[],
): Promise<ImportRemoteVideoFilesResult> {
  const matchForPf = new Map<ParsedFile, TorrentFileInfo>();

  for (const pf of parsedFiles) {
    const pfBasename = pf.file.name.substring(pf.file.name.lastIndexOf("/") + 1);
    const pfExt = pf.extension.toLowerCase();

    const sizeAndExtMatches = originalFiles.filter(
      (of) => of.size === pf.file.size && of.name.toLowerCase().endsWith(pfExt),
    );
    let match: TorrentFileInfo | undefined;
    if (sizeAndExtMatches.length === 1) {
      match = sizeAndExtMatches[0];
    } else if (sizeAndExtMatches.length > 1) {
      match =
        sizeAndExtMatches.find((of) =>
          of.name.substring(of.name.lastIndexOf("/") + 1).includes(pfBasename),
        ) ?? sizeAndExtMatches[0];
      deps.logger.warn(
        `[auto-import] Ambiguous file match for "${pfBasename}" — ${sizeAndExtMatches.length} candidates, using "${match?.name}"`,
      );
    } else {
      const sizeMatch = originalFiles.find((of) => of.size === pf.file.size);
      if (sizeMatch) {
        deps.logger.warn(
          `[auto-import] Weak file match (size only) for "${pfBasename}" → "${sizeMatch.name}"`,
        );
      }
      match = sizeMatch;
    }

    if (!match) {
      deps.logger.warn(
        `[auto-import] No torrent file matched for "${pfBasename}"`,
      );
      continue;
    }

    matchForPf.set(pf, match);
  }

  const renameOps = new Map<string, string>();
  for (const [pf, match] of matchForPf) {
    if (match.name !== pf.targetFilename && !renameOps.has(match.name)) {
      renameOps.set(match.name, pf.targetFilename);
    }
  }

  const renamedByOriginal = new Map<string, string>();
  for (const [oldPath, newPath] of renameOps) {
    try {
      await deps.client.renameFile(hash, oldPath, newPath);
      renamedByOriginal.set(oldPath, newPath);
      deps.logger.info?.(`[auto-import] Renamed "${oldPath}" → "${newPath}"`);
    } catch (err) {
      deps.logger.warn(
        `[auto-import] renameFile failed for "${oldPath}" — proceeding with move using original name`,
        { error: err instanceof Error ? err.message : String(err) },
      );
      renamedByOriginal.set(oldPath, oldPath);
      await createNotification(
        { repo: deps.notifications },
        {
          title: "File rename failed",
          message: `Could not rename "${oldPath.substring(oldPath.lastIndexOf("/") + 1)}" during import. The file is using its original name.`,
          type: "import_warning",
          mediaId: mediaRow.id,
        },
      );
    }
  }

  try {
    await deps.client.setLocation(hash, qbitTargetLocation);
    deps.logger.info?.(`[auto-import] Remote move → ${qbitTargetLocation}`);
  } catch (err) {
    deps.logger.error(`[auto-import] setLocation failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return { importedCount: 0, postMoveFiles: [] };
  }

  const deadline = Date.now() + MAX_MOVE_MS;
  const normalizedTarget = path.normalize(qbitTargetLocation);

  let moved = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const torrents = await deps.client.listTorrents({ hashes: [hash] });
    const info = torrents[0];
    if (!info) continue;

    const savePathMatches = path
      .normalize(info.save_path)
      .startsWith(normalizedTarget);
    if (savePathMatches && info.state !== "moving") {
      moved = true;
      break;
    }
  }

  if (!moved) {
    deps.logger.error(
      `[auto-import] Remote move did not complete within ${MAX_MOVE_MS / 60000} minutes — files may not have moved to "${qbitTargetLocation}"`,
    );
    return { importedCount: 0, postMoveFiles: [] };
  }

  let postMoveFiles: TorrentFileInfo[] = [];
  try {
    postMoveFiles = await deps.client.getTorrentFiles(hash);
  } catch {
    // Non-critical — proceed with empty list (subtitle pass becomes a no-op).
  }

  const nested = postMoveFiles.filter((f) => f.name.includes("/"));
  if (nested.length > 0) {
    deps.logger.warn(
      `[auto-import] Torrent ${hash} still has ${nested.length} file(s) under subfolders after import: ${nested.map((f) => f.name).join(", ")}`,
    );
  }

  let importedCount = 0;
  for (const [pf, match] of matchForPf) {
    try {
      const finalName = renamedByOriginal.get(match.name) ?? match.name;
      const finalPath = `${libraryTargetLocation}/${finalName}`;
      importedCount += await upsertMediaFile(
        deps.torrents,
        pf,
        finalPath,
        placeholders,
        alreadyImported,
        mediaRow,
        torrentRow,
      );
    } catch (err) {
      deps.logger.error(`[auto-import] File error "${pf.file.name}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { importedCount, postMoveFiles };
}

export async function importRemoteSubtitleFiles(
  deps: { client: DownloadClientPort; logger: LoggerPort },
  subtitleFiles: Array<{ name: string; size: number }>,
  hash: string,
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
        try {
          await deps.client.renameFile(hash, sf.name, targetSubName);
          deps.logger.info?.(
            `[auto-import] Renamed subtitle: ${sf.name} → ${targetSubName}`,
          );
        } catch {
          deps.logger.warn(
            `[auto-import] renameFile failed for subtitle "${sf.name}"`,
          );
        }
      }
    } catch {
      // Non-critical
    }
  }
}
