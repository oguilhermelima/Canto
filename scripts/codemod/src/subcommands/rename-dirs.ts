import { resolve } from "node:path";
import { existsSync, readdirSync, rmdirSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { requireSafeToMutate } from "../helpers/git.ts";

/**
 * After restructure-infra and classify-domain, the old directories
 * `packages/core/src/infrastructure` and `packages/core/src/lib` should be empty shells.
 * This command verifies they're empty and removes them.
 */
export function runRenameDirs(ctx: CodemodContext): void {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "rename-dirs", dry: ctx.dry, apply: ctx.apply });

  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const srcAbs = resolve(ctx.repoRoot, ctx.plan.srcRoot);
  const candidates = [
    { abs: resolve(srcAbs, "infrastructure"), label: "infrastructure/" },
    { abs: resolve(srcAbs, "lib"), label: "lib/" },
  ];

  let removed = 0;
  let skipped = 0;

  for (const c of candidates) {
    if (!existsSync(c.abs)) {
      logger.log({ op: "skip", reason: "already-removed", target: c.label });
      skipped++;
      continue;
    }
    const leftover = walkLeaves(c.abs);
    if (leftover.length > 0) {
      logger.log({ op: "warn", message: `${c.label} has ${leftover.length} leftover files; refusing to remove.` });
      logger.print(`  REFUSE ${c.label}  has ${leftover.length} leftovers (extend the plan).`);
      for (const lf of leftover.slice(0, 10)) logger.print(`    - ${lf}`);
      continue;
    }
    if (ctx.apply) removeEmptyTree(c.abs);
    logger.log({ op: "delete", path: c.label, reason: "empty after content moves" });
    logger.print(`  REMOVE ${c.label}  (empty)`);
    removed++;
  }

  logger.summary(`removed=${removed} skipped=${skipped} dry=${!ctx.apply}`);
}

function walkLeaves(dir: string): string[] {
  const leaves: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const sub = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      leaves.push(...walkLeaves(sub));
    } else {
      leaves.push(sub);
    }
  }
  return leaves;
}

function removeEmptyTree(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyTree(`${dir}/${entry.name}`);
    }
  }
  rmdirSync(dir);
}
