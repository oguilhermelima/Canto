import { resolve, relative, dirname } from "node:path";
import { mkdirSync, existsSync, renameSync } from "node:fs";

import type { Project, SourceFile } from "ts-morph";

import type { CodemodLogger } from "./logger.ts";

export interface MoveResult {
  from: string;
  to: string;
  importersTouched: string[];
  skipped: boolean;
  reason?: string;
}

/**
 * Move a source file using ts-morph so every importer is automatically rewritten.
 * Paths are relative to `packageRoot`.
 */
export function moveSourceFile(
  project: Project,
  packageRoot: string,
  fromRel: string,
  toRel: string,
  logger: CodemodLogger,
): MoveResult {
  const fromAbs = resolve(packageRoot, fromRel);
  const toAbs = resolve(packageRoot, toRel);

  if (!existsSync(fromAbs) && existsSync(toAbs)) {
    logger.log({ op: "skip", reason: "already-moved", target: toRel });
    return { from: fromRel, to: toRel, importersTouched: [], skipped: true, reason: "already-moved" };
  }
  if (!existsSync(fromAbs)) {
    logger.log({ op: "skip", reason: "source-missing", target: fromRel });
    return { from: fromRel, to: toRel, importersTouched: [], skipped: true, reason: "source-missing" };
  }
  if (existsSync(toAbs)) {
    throw new Error(`Move target already exists: ${toRel}`);
  }

  const sourceFile: SourceFile | undefined = project.getSourceFile(fromAbs);
  if (!sourceFile) {
    throw new Error(`ts-morph did not load ${fromRel}; check tsconfig.json include.`);
  }

  const beforeReferrers = new Set<string>();
  for (const ref of sourceFile.getReferencingSourceFiles()) {
    beforeReferrers.add(ref.getFilePath());
  }

  mkdirSync(dirname(toAbs), { recursive: true });
  sourceFile.move(toAbs, { overwrite: false });

  const importersTouched = [...beforeReferrers].map((abs) => relative(packageRoot, abs));

  logger.log({ op: "move", from: fromRel, to: toRel, importersTouched });
  logger.print(`  MOVE  ${fromRel}\n    ->  ${toRel}\n        updates ${importersTouched.length} importers`);

  return { from: fromRel, to: toRel, importersTouched, skipped: false };
}

/**
 * Non-ts-morph rename for files that aren't .ts (or directories). Keeps history via git when called
 * through gitMove wrapper. This function is for plain renames that don't trigger import rewrites.
 */
export function renameFileRaw(fromAbs: string, toAbs: string): void {
  mkdirSync(dirname(toAbs), { recursive: true });
  renameSync(fromAbs, toAbs);
}
