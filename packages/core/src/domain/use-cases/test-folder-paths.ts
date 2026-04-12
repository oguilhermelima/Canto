import { access, constants } from "node:fs/promises";
import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { findAllFolders } from "../../infrastructure/repositories/folder-repository";

/** Test if a path is accessible and writable. */
async function testPath(p: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!p) return { ok: false, error: "Not configured" };
  try {
    await access(p, constants.R_OK | constants.W_OK);
    return { ok: true };
  } catch {
    return { ok: false, error: `Path "${p}" is not accessible or writable` };
  }
}

/**
 * Test all folder paths for accessibility.
 * Respects the import method setting (local vs remote).
 */
export async function testFolderPaths(db: Database) {
  const importMethod = (await getSetting("download.importMethod")) ?? "local";
  const folders = await findAllFolders(db);

  const results: Array<{
    name: string;
    downloadPath: { ok: boolean; error?: string };
    libraryPath: { ok: boolean; error?: string };
  }> = [];

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
      const dl = await testPath(folder.downloadPath);
      const lib = await testPath(folder.libraryPath);
      results.push({ name: folder.name, downloadPath: dl, libraryPath: lib });
    }
  }

  return results;
}
