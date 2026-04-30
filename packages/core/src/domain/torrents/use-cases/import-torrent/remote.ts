import path from "node:path";

import type { Database } from "@canto/db/client";
import type { DownloadClientPort, TorrentFileInfo } from "../../../shared/ports/download-client";
import { createNotification } from "../../../notifications/use-cases/create-notification";
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

export interface ImportRemoteVideoFilesResult {
  importedCount: number;
  /**
   * Post-move file list as reported by qBit after the torrent has finished
   * relocating. Empty array if the move failed or the post-move fetch threw.
   * Callers reuse this to drive subtitle imports and nested-folder warnings
   * without making a second `getTorrentFiles` round-trip.
   */
  postMoveFiles: TorrentFileInfo[];
}

export async function importRemoteVideoFiles(
  parsedFiles: ParsedFile[],
  client: DownloadClientPort,
  hash: string,
  qbitTargetLocation: string,
  libraryTargetLocation: string,
  _libRow: { libraryPath: string | null } | null,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  db: Database,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
  originalFiles: TorrentFileInfo[],
): Promise<ImportRemoteVideoFilesResult> {
  // Match each parsed file against the PRE-MOVE torrent file list so we can
  // rename files in place BEFORE asking qBit to move them. Renaming is instant
  // (it just changes the internal path within the torrent), whereas
  // setLocation can take minutes for cross-filesystem moves of large files.
  // Doing the rename first eliminates the window in which the file exists at
  // the destination with its raw torrent name — otherwise Jellyfin's scheduled
  // scan may pick up that intermediate name and create a phantom entry.
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
      match = sizeAndExtMatches.find((of) =>
        of.name.substring(of.name.lastIndexOf("/") + 1).includes(pfBasename),
      ) ?? sizeAndExtMatches[0];
      console.warn(
        `[auto-import] Ambiguous file match for "${pfBasename}" — ${sizeAndExtMatches.length} candidates, using "${match?.name}"`,
      );
    } else {
      const sizeMatch = originalFiles.find((of) => of.size === pf.file.size);
      if (sizeMatch) {
        console.warn(
          `[auto-import] Weak file match (size only) for "${pfBasename}" → "${sizeMatch.name}"`,
        );
      }
      match = sizeMatch;
    }

    if (!match) {
      console.warn(`[auto-import] No torrent file matched for "${pfBasename}"`);
      continue;
    }

    matchForPf.set(pf, match);
  }

  // Dedupe rename operations by original name: multi-episode files produce
  // multiple ParsedFile entries that all point at the same physical torrent
  // file and share the same targetFilename.
  const renameOps = new Map<string, string>();
  for (const [pf, match] of matchForPf) {
    if (match.name !== pf.targetFilename && !renameOps.has(match.name)) {
      renameOps.set(match.name, pf.targetFilename);
    }
  }

  // Track the post-rename name for every original name we touched. If rename
  // fails we fall back to the original name and still let the move proceed —
  // the data will land in the right directory even if the filename is stale.
  const renamedByOriginal = new Map<string, string>();
  for (const [oldPath, newPath] of renameOps) {
    try {
      await client.renameFile(hash, oldPath, newPath);
      renamedByOriginal.set(oldPath, newPath);
      console.log(`[auto-import] Renamed "${oldPath}" → "${newPath}"`);
    } catch (err) {
      console.warn(
        `[auto-import] renameFile failed for "${oldPath}": ${err instanceof Error ? err.message : err} — proceeding with move using original name`,
      );
      renamedByOriginal.set(oldPath, oldPath);
      await createNotification(db, {
        title: "File rename failed",
        message: `Could not rename "${oldPath.substring(oldPath.lastIndexOf("/") + 1)}" during import. The file is using its original name.`,
        type: "import_warning",
        mediaId: mediaRow.id,
      });
    }
  }

  try {
    await client.setLocation(hash, qbitTargetLocation);
    console.log(`[auto-import] Remote move → ${qbitTargetLocation}`);
  } catch (err) {
    console.error(`[auto-import] setLocation failed:`, err instanceof Error ? err.message : err);
    return { importedCount: 0, postMoveFiles: [] };
  }

  // Poll until qBittorrent has finished moving files to the new location.
  // Cross-filesystem moves of large torrents can take several minutes, so we
  // watch the torrent state (qBit reports "moving") with a hard 30-minute cap
  // to avoid infinite loops if qBit gets stuck.
  const MAX_MOVE_MS = 30 * 60 * 1000;
  const POLL_INTERVAL_MS = 3000;
  const deadline = Date.now() + MAX_MOVE_MS;
  const normalizedTarget = path.normalize(qbitTargetLocation);

  let moved = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const torrents = await client.listTorrents({ hashes: [hash] });
    const info = torrents[0];
    if (!info) continue;

    const savePathMatches = path.normalize(info.save_path).startsWith(normalizedTarget);
    if (savePathMatches && info.state !== "moving") {
      moved = true;
      break;
    }
  }

  if (!moved) {
    console.error(
      `[auto-import] Remote move did not complete within ${MAX_MOVE_MS / 60000} minutes — files may not have moved to "${qbitTargetLocation}"`,
    );
    return { importedCount: 0, postMoveFiles: [] };
  }

  // Single post-move fetch — reused below for the nested-folder warning AND
  // returned to the caller so subtitle import can match against the fresh
  // names without another qBit round-trip. Pre-refactor this fetched 3×
  // total (here, in the caller for subtitles, and for the nested check).
  let postMoveFiles: TorrentFileInfo[] = [];
  try {
    postMoveFiles = await client.getTorrentFiles(hash);
  } catch {
    // Non-critical — proceed with empty list (subtitle pass becomes a no-op).
  }

  // Warn if any file is still under a subfolder after rename+move. Sibling
  // files of nested releases (samples, .nfo, .txt) cannot be cleaned up from
  // the worker — filesystem cleanup is intentionally out of scope here.
  const nested = postMoveFiles.filter((f) => f.name.includes("/"));
  if (nested.length > 0) {
    console.warn(
      `[auto-import] Torrent ${hash} still has ${nested.length} file(s) under subfolders after import: ${nested.map((f) => f.name).join(", ")}`,
    );
  }

  let importedCount = 0;
  for (const [pf, match] of matchForPf) {
    try {
      const finalName = renamedByOriginal.get(match.name) ?? match.name;
      const finalPath = `${libraryTargetLocation}/${finalName}`;
      importedCount += await upsertMediaFile(
        db,
        pf,
        finalPath,
        placeholders,
        alreadyImported,
        mediaRow,
        torrentRow,
      );
    } catch (err) {
      console.error(`[auto-import] File error "${pf.file.name}":`, err instanceof Error ? err.message : err);
    }
  }

  return { importedCount, postMoveFiles };
}

export async function importRemoteSubtitleFiles(
  subtitleFiles: Array<{ name: string; size: number }>,
  client: DownloadClientPort,
  hash: string,
  mediaRow: { type: string },
  mediaNaming: MediaNaming,
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
): Promise<void> {
  for (const sf of subtitleFiles) {
    try {
      const targetSubName = buildSubtitleName(sf.name, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);
      if (targetSubName) {
        try {
          await client.renameFile(hash, sf.name, targetSubName);
          console.log(`[auto-import] Renamed subtitle: ${sf.name} → ${targetSubName}`);
        } catch {
          console.warn(`[auto-import] renameFile failed for subtitle "${sf.name}"`);
        }
      }
    } catch {
      // Non-critical
    }
  }
}
