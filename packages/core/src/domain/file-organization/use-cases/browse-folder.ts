import nodePath from "node:path";

import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";

export interface BrowseFolderResult {
  path: string;
  parent: string;
  dirs: Array<{ name: string; path: string }>;
}

/**
 * List directory children for the admin folder picker.
 * Hidden entries (dotfiles) are filtered. Inaccessible paths return an empty
 * `dirs` list rather than throwing, so the UI can recover gracefully.
 */
export async function browseFolder(
  targetPath: string,
  deps: { fs: FileSystemPort },
): Promise<BrowseFolderResult> {
  const normalized = nodePath.resolve(targetPath);
  const parent = nodePath.dirname(normalized);

  try {
    const entries = await deps.fs.readdir(normalized);
    const dirs = entries
      .filter((e) => e.isDirectory && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: nodePath.join(normalized, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { path: normalized, parent, dirs };
  } catch {
    return { path: normalized, parent, dirs: [] };
  }
}
