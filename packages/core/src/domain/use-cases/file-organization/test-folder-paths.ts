import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";

import type { FileSystemPort } from "../../ports/file-system.port";
import { findAllFolders } from "../../../infrastructure/repositories/file-organization/folder";

interface PathResult {
  ok: boolean;
  error?: string;
}

export interface FolderPathResult {
  name: string;
  downloadPath: PathResult;
  libraryPath: PathResult;
}

async function testPath(
  fs: FileSystemPort,
  p: string | null,
): Promise<PathResult> {
  if (!p) return { ok: false, error: "Not configured" };
  try {
    await fs.access(p, "read-write");
    return { ok: true };
  } catch {
    return { ok: false, error: `Path "${p}" is not accessible or writable` };
  }
}

/**
 * Test all folder paths for accessibility.
 * Respects the import method setting (local vs remote).
 */
export async function testFolderPaths(
  db: Database,
  deps: { fs: FileSystemPort },
): Promise<FolderPathResult[]> {
  const importMethod = (await getSetting("download.importMethod")) ?? "local";
  const folders = await findAllFolders(db);

  const results: FolderPathResult[] = [];

  for (const folder of folders) {
    if (importMethod === "remote") {
      results.push({
        name: folder.name,
        downloadPath: folder.downloadPath
          ? { ok: true, error: "Remote mode — path is from qBittorrent's perspective" }
          : { ok: false, error: "Not configured" },
        libraryPath: folder.libraryPath
          ? { ok: true, error: "Remote mode — path is from qBittorrent's perspective" }
          : { ok: false, error: "Not configured" },
      });
    } else {
      const dl = await testPath(deps.fs, folder.downloadPath);
      const lib = await testPath(deps.fs, folder.libraryPath);
      results.push({ name: folder.name, downloadPath: dl, libraryPath: lib });
    }
  }

  return results;
}
