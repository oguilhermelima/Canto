import { resolve, relative } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { moveSourceFile } from "../helpers/move-file.ts";

/**
 * Move every file under domain/use-cases/<ctx>/ to domain/<ctx>/use-cases/.
 * Uses ts-morph per-file move so all importers get rewritten.
 */
export async function runMoveUseCases(ctx: CodemodContext): Promise<void> {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "move-use-cases", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const corePackageRoot = resolve(ctx.repoRoot, ctx.plan.packageRoot);
  const { project } = loadProject(corePackageRoot);

  let moved = 0;

  for (const m of ctx.plan.useCaseContextMoves) {
    const fromDirAbs = resolve(corePackageRoot, "src", m.from);
    const toDirAbs = resolve(corePackageRoot, "src", m.to);
    if (!existsSync(fromDirAbs)) {
      logger.log({ op: "skip", reason: "source-dir-missing", target: m.from });
      continue;
    }
    const files = listTsFiles(fromDirAbs);
    for (const abs of files) {
      const fileFromRel = `src/${m.from}/${relative(fromDirAbs, abs)}`;
      const fileToRel = `src/${m.to}/${relative(fromDirAbs, abs)}`;
      try {
        const r = moveSourceFile(project, corePackageRoot, fileFromRel, fileToRel, logger);
        if (!r.skipped) moved++;
      } catch (err) {
        logger.log({ op: "warn", message: `use-case move ${fileFromRel} -> ${fileToRel}: ${(err as Error).message}` });
      }
    }
    logger.print(`  BATCH ${m.from} -> ${m.to}  (${files.length} files)`);
  }

  if (ctx.apply) await project.save();

  logger.summary(`moved=${moved} dry=${!ctx.apply}`);
  logger.print(`done: moved=${moved} files`);
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const sub = resolve(dir, entry);
    if (statSync(sub).isDirectory()) {
      out.push(...listTsFiles(sub));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(sub);
    }
  }
  return out;
}
