import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { moveSourceFile } from "../helpers/move-file.ts";
import { rewriteCrossWorkspaceSpecifiers } from "../helpers/rewrite-cross-workspace.ts";
import { isDomainMove } from "../plan/schema.ts";

export async function runClassifyDomain(ctx: CodemodContext): Promise<void> {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "classify-domain", dry: ctx.dry, apply: ctx.apply });

  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const corePackageRoot = resolve(ctx.repoRoot, ctx.plan.packageRoot);
  const { project } = loadProject(corePackageRoot);
  const srcRootRel = ctx.plan.srcRoot.replace(/^packages\/core\/?/, "");
  const srcPrefix = srcRootRel ? `${srcRootRel}/` : "src/";

  let moved = 0;
  let deleted = 0;
  let kept = 0;
  const crossWorkspaceMoves: Array<{ oldSubpath: string; newSubpath: string }> = [];

  const stripTs = (p: string) => p.replace(/\.tsx?$/, "");

  for (const entry of ctx.plan.domainClassification) {
    const fromRel = `${srcPrefix}${entry.from}`;

    if (isDomainMove(entry)) {
      const toRel = `${srcPrefix}${entry.to}`;
      try {
        const r = moveSourceFile(project, corePackageRoot, fromRel, toRel, logger);
        if (!r.skipped) {
          moved++;
          crossWorkspaceMoves.push({
            oldSubpath: stripTs(entry.from),
            newSubpath: stripTs(entry.to),
          });
        }
      } catch (err) {
        logger.log({ op: "warn", message: `classify-domain: ${fromRel} -> ${toRel} failed: ${(err as Error).message}` });
      }
      continue;
    }

    if (entry.action === "delete") {
      const abs = resolve(corePackageRoot, fromRel);
      if (existsSync(abs)) {
        if (ctx.apply) {
          // For ts-morph-tracked files, prefer sf.delete() so references are updated.
          const sf = project.getSourceFile(abs);
          if (sf) sf.delete();
          else unlinkSync(abs);
        }
        logger.log({ op: "delete", path: fromRel, reason: entry.reason });
        logger.print(`  DELETE ${fromRel}  (${entry.reason})`);
        deleted++;
      } else {
        logger.log({ op: "skip", reason: "already-deleted", target: fromRel });
      }
      continue;
    }

    if (entry.action === "keep") {
      kept++;
      continue;
    }

    if (entry.action === "rename-sibling") {
      const toRel = `${srcPrefix}${entry.to}`;
      try {
        const r = moveSourceFile(project, corePackageRoot, fromRel, toRel, logger);
        if (!r.skipped) {
          moved++;
          crossWorkspaceMoves.push({
            oldSubpath: stripTs(entry.from),
            newSubpath: stripTs(entry.to),
          });
        }
      } catch (err) {
        logger.log({ op: "warn", message: `rename-sibling ${fromRel} -> ${toRel}: ${(err as Error).message}` });
      }
      continue;
    }

    // entry.action === "split-errors" is handled by the split-errors
    // subcommand; the loop body falls through to the next entry.
  }

  if (ctx.apply) await project.save();

  const xr = rewriteCrossWorkspaceSpecifiers(ctx.repoRoot, crossWorkspaceMoves, logger, ctx.apply);
  logger.print(`cross-workspace: ${xr.rewrites} rewrites across ${xr.files} files`);

  logger.summary(`moved=${moved} deleted=${deleted} kept=${kept} xworkspace=${xr.rewrites} dry=${!ctx.apply}`);
  logger.print(`done: moved=${moved} deleted=${deleted} kept=${kept}`);
}
