import { resolve } from "node:path";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { findIndexBarrels, convertIndexToSibling } from "../helpers/sibling-barrel.ts";

export async function runSiblingBarrels(ctx: CodemodContext): Promise<void> {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "sibling-barrels", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const corePackageRoot = resolve(ctx.repoRoot, ctx.plan.packageRoot);
  const { project } = loadProject(corePackageRoot);

  const barrels = findIndexBarrels(project, corePackageRoot, "src/index.ts");
  logger.print(`found ${barrels.length} barrels to convert`);

  let converted = 0;
  for (const rel of barrels) {
    const r = convertIndexToSibling(project, corePackageRoot, rel, logger);
    if (r.converted) converted++;
  }

  if (ctx.apply) await project.save();

  logger.summary(`converted=${converted}/${barrels.length} dry=${!ctx.apply}`);
  logger.print(`done: converted=${converted}/${barrels.length}`);
}
