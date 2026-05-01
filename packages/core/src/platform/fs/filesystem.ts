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

// Pure file-parsing helpers moved into the torrents domain — re-exported
// here so legacy imports keep working.
export {
  buildSubtitleName,
  parseVideoFiles,
} from "../../domain/torrents/rules/parse-video-files";
export type { ParsedFile } from "../../domain/torrents/rules/parse-video-files";

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
