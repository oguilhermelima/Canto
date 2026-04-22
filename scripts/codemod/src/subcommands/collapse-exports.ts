import { resolve } from "node:path";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { rewritePackageExports } from "../helpers/rewrite-package-json.ts";

export function runCollapseExports(ctx: CodemodContext): void {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "collapse-exports", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const target = ctx.plan.exports["packages/core/package.json"].target.exports;
  const packageJsonPath = resolve(ctx.repoRoot, "packages/core/package.json");

  if (!ctx.apply) {
    logger.print(`DRY: would rewrite ${packageJsonPath} exports block to:`);
    logger.print(JSON.stringify(target, null, 2));
    return;
  }

  const r = rewritePackageExports(packageJsonPath, target);
  if (r.modified) {
    logger.log({ op: "write", path: packageJsonPath, bytes: 0 });
    logger.print(`APPLIED: exports block updated`);
  } else {
    logger.log({ op: "skip", reason: "exports block already matches target" });
    logger.print(`SKIP: exports block already matches target`);
  }
}
