import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { moveSourceFile } from "../helpers/move-file.ts";

export async function runRestructureInfra(ctx: CodemodContext): Promise<void> {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "restructure-infra", dry: ctx.dry, apply: ctx.apply });

  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const corePackageRoot = resolve(ctx.repoRoot, ctx.plan.packageRoot);
  const { project } = loadProject(corePackageRoot);
  const srcPrefix = "src/";

  let moved = 0;
  let deleted = 0;

  for (const move of ctx.plan.infraMoves) {
    const fromRel = `${srcPrefix}${move.from}`;
    const toRel = `${srcPrefix}${move.to}`;
    try {
      const r = moveSourceFile(project, corePackageRoot, fromRel, toRel, logger);
      if (!r.skipped) moved++;
    } catch (err) {
      logger.log({ op: "warn", message: `infra move ${fromRel} -> ${toRel}: ${(err as Error).message}` });
    }
  }

  for (const barrelRel of ctx.plan.infraBarrelsToDelete) {
    const fullRel = `${srcPrefix}${barrelRel}`;
    const abs = resolve(corePackageRoot, fullRel);
    if (!existsSync(abs)) {
      logger.log({ op: "skip", reason: "already-deleted", target: fullRel });
      continue;
    }
    if (ctx.apply) {
      const sf = project.getSourceFile(abs);
      if (sf) sf.delete();
      else unlinkSync(abs);
    }
    logger.log({ op: "delete", path: fullRel, reason: "infra barrel replaced by sibling barrels" });
    logger.print(`  DELETE ${fullRel}  (legacy barrel)`);
    deleted++;
  }

  if (ctx.apply) await project.save();

  logger.summary(`moved=${moved} deleted=${deleted} dry=${!ctx.apply}`);
  logger.print(`done: moved=${moved} deleted=${deleted}`);
}
