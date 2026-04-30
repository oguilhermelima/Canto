import { resolve, relative } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { moveSourceFile } from "../helpers/move-file.ts";
import { rewriteCrossWorkspaceSpecifiers } from "../helpers/rewrite-cross-workspace.ts";

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
  const stripTs = (p: string) => p.replace(/\.tsx?$/, "");
  const crossWorkspaceMoves: Array<{ oldSubpath: string; newSubpath: string }> = [];

  for (const m of ctx.plan.useCaseContextMoves) {
    const fromDirAbs = resolve(corePackageRoot, "src", m.from);
    // toDirAbs reserved for future move logic; not needed in this loop.
    void m.to;
    if (!existsSync(fromDirAbs)) {
      logger.log({ op: "skip", reason: "source-dir-missing", target: m.from });
      continue;
    }
    const files = listTsFiles(fromDirAbs);
    for (const abs of files) {
      const relFromDir = relative(fromDirAbs, abs);
      const fileFromRel = `src/${m.from}/${relFromDir}`;
      const fileToRel = `src/${m.to}/${relFromDir}`;
      try {
        const r = moveSourceFile(project, corePackageRoot, fileFromRel, fileToRel, logger);
        if (!r.skipped) {
          moved++;
          crossWorkspaceMoves.push({
            oldSubpath: stripTs(`${m.from}/${relFromDir}`),
            newSubpath: stripTs(`${m.to}/${relFromDir}`),
          });
        }
      } catch (err) {
        logger.log({ op: "warn", message: `use-case move ${fileFromRel} -> ${fileToRel}: ${(err as Error).message}` });
      }
    }
    logger.print(`  BATCH ${m.from} -> ${m.to}  (${files.length} files)`);
  }

  if (ctx.apply) await project.save();

  const xr = rewriteCrossWorkspaceSpecifiers(ctx.repoRoot, crossWorkspaceMoves, logger, ctx.apply);
  logger.print(`cross-workspace: ${xr.rewrites} rewrites across ${xr.files} files`);

  logger.summary(`moved=${moved} xworkspace=${xr.rewrites} dry=${!ctx.apply}`);
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
