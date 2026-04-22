import { resolve, dirname, basename, relative } from "node:path";
import { existsSync } from "node:fs";

import type { Project } from "ts-morph";

import type { CodemodLogger } from "./logger.ts";
import { moveSourceFile } from "./move-file.ts";

/**
 * Convert `<folder>/index.ts` into sibling `<folder>.ts`.
 *
 * ts-morph's SourceFile.move() handles both the rename AND the import rewrites:
 * anything that did `from "...folder"` (resolving via folder-index) keeps working
 * because TypeScript's bundler resolution picks up the new sibling `<folder>.ts`
 * ahead of a folder lookup. Internal re-exports in the moved file also get
 * rewritten by ts-morph when we adjust relative paths inside the file.
 */
export function convertIndexToSibling(
  project: Project,
  packageRoot: string,
  indexRelPath: string,
  logger: CodemodLogger,
): { converted: boolean; to?: string } {
  const folderRel = dirname(indexRelPath);
  const folderName = basename(folderRel);
  const parentRel = dirname(folderRel);
  const siblingRel = parentRel === "." ? `${folderName}.ts` : `${parentRel}/${folderName}.ts`;

  const indexAbs = resolve(packageRoot, indexRelPath);
  const siblingAbs = resolve(packageRoot, siblingRel);

  if (!existsSync(indexAbs)) {
    logger.log({ op: "skip", reason: "source-missing", target: indexRelPath });
    return { converted: false };
  }
  if (existsSync(siblingAbs)) {
    logger.log({ op: "skip", reason: "sibling-exists", target: siblingRel });
    return { converted: false };
  }

  const sourceFile = project.getSourceFile(indexAbs);
  if (!sourceFile) {
    throw new Error(`ts-morph did not load ${indexRelPath}`);
  }

  // Rewrite relative re-exports: `./foo` -> `./<folder>/foo` so they still resolve
  // once the file sits next to (not inside) the folder.
  for (const exp of sourceFile.getExportDeclarations()) {
    const spec = exp.getModuleSpecifierValue();
    if (!spec) continue;
    if (spec.startsWith("./")) {
      exp.setModuleSpecifier(`./${folderName}/${spec.slice(2)}`);
    } else if (spec === ".") {
      exp.setModuleSpecifier(`./${folderName}`);
    }
  }
  for (const imp of sourceFile.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec.startsWith("./")) {
      imp.setModuleSpecifier(`./${folderName}/${spec.slice(2)}`);
    }
  }

  // Move the file. ts-morph auto-updates all external importers.
  moveSourceFile(project, packageRoot, indexRelPath, siblingRel, logger);
  logger.log({ op: "rename-sibling", from: indexRelPath, to: siblingRel });
  return { converted: true, to: siblingRel };
}

export function findIndexBarrels(project: Project, packageRoot: string, excludeRoot: string): string[] {
  const results: string[] = [];
  const excludeAbs = resolve(packageRoot, excludeRoot);
  for (const sf of project.getSourceFiles()) {
    const abs = sf.getFilePath();
    if (!abs.startsWith(resolve(packageRoot, "src") + "/")) continue;
    if (basename(abs) !== "index.ts") continue;
    if (abs === excludeAbs) continue;
    results.push(relative(packageRoot, abs));
  }
  return results.sort();
}
