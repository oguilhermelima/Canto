import { resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";

import { Project } from "ts-morph";

import type { CodemodLogger } from "./logger.ts";

/**
 * After moving files inside `packages/core`, rewrite `@canto/core/<old>` specifiers
 * across all other workspace packages to `@canto/core/<new>`.
 *
 * `moves` maps old subpath (relative to packages/core/src, without .ts) to new subpath.
 * Example: "domain/ports/media-provider.port" -> "domain/shared/ports/media-provider.port"
 */
export function rewriteCrossWorkspaceSpecifiers(
  repoRoot: string,
  moves: Array<{ oldSubpath: string; newSubpath: string }>,
  logger: CodemodLogger,
  apply: boolean,
): { files: number; rewrites: number } {
  if (moves.length === 0) return { files: 0, rewrites: 0 };

  const oldToNew = new Map(moves.map((m) => [m.oldSubpath, m.newSubpath]));

  const workspaceDirs = listWorkspacePackages(repoRoot, ["apps", "packages"])
    .filter((dir) => !dir.endsWith("/packages/core")); // skip core itself

  let totalFiles = 0;
  let totalRewrites = 0;

  for (const pkgDir of workspaceDirs) {
    const tsconfig = resolve(pkgDir, "tsconfig.json");
    try {
      statSync(tsconfig);
    } catch {
      continue; // no tsconfig, skip
    }
    const project = new Project({
      tsConfigFilePath: tsconfig,
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: true,
    });

    let touchedThisPkg = 0;
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (filePath.includes("/node_modules/") || filePath.includes("/.next/") || filePath.includes("/dist/")) continue;

      let touchedFile = 0;

      for (const imp of sf.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue();
        const replaced = remapSpecifier(spec, oldToNew);
        if (replaced !== null && replaced !== spec) {
          imp.setModuleSpecifier(replaced);
          logger.log({ op: "rewrite-import", file: filePath, from: spec, to: replaced });
          touchedFile++;
          totalRewrites++;
        }
      }
      for (const exp of sf.getExportDeclarations()) {
        const spec = exp.getModuleSpecifierValue();
        if (!spec) continue;
        const replaced = remapSpecifier(spec, oldToNew);
        if (replaced !== null && replaced !== spec) {
          exp.setModuleSpecifier(replaced);
          logger.log({ op: "rewrite-import", file: filePath, from: spec, to: replaced });
          touchedFile++;
          totalRewrites++;
        }
      }

      if (touchedFile > 0) {
        touchedThisPkg++;
        totalFiles++;
      }
    }

    if (apply && touchedThisPkg > 0) {
      project.saveSync();
      logger.print(`  x-workspace ${pkgDir.replace(repoRoot + "/", "")}: ${touchedThisPkg} files touched`);
    }
  }

  return { files: totalFiles, rewrites: totalRewrites };
}

function remapSpecifier(spec: string, oldToNew: Map<string, string>): string | null {
  const prefix = "@canto/core/";
  if (!spec.startsWith(prefix)) return null;
  const tail = spec.slice(prefix.length);

  // Exact match
  const exact = oldToNew.get(tail);
  if (exact) return `${prefix}${exact}`;

  // Deeper import: `@canto/core/<old>/<rest>` — no-op if no oldToNew entry matches.
  for (const [oldSub, newSub] of oldToNew) {
    if (tail === oldSub) return `${prefix}${newSub}`;
    if (tail.startsWith(oldSub + "/")) {
      return `${prefix}${newSub}${tail.slice(oldSub.length)}`;
    }
  }
  return null;
}

function listWorkspacePackages(repoRoot: string, baseDirs: string[]): string[] {
  const out: string[] = [];
  for (const base of baseDirs) {
    const baseAbs = resolve(repoRoot, base);
    try {
      for (const entry of readdirSync(baseAbs)) {
        const sub = resolve(baseAbs, entry);
        try {
          if (statSync(sub).isDirectory()) out.push(sub);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  return out;
}
