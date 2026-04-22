import { resolve } from "node:path";
import { readdirSync, existsSync, statSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { ensureTsconfigPaths } from "../helpers/write-tsconfig.ts";

/**
 * Add "@/*": ["./src/*"] to every package + app tsconfig.json.
 */
export function runAddTsconfigPaths(ctx: CodemodContext): void {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "add-tsconfig-paths", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const dirs = ["apps", "packages"];
  const targets: string[] = [];
  for (const dir of dirs) {
    const abs = resolve(ctx.repoRoot, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      const sub = resolve(abs, entry);
      if (!statSync(sub).isDirectory()) continue;
      const tsconfig = resolve(sub, "tsconfig.json");
      if (existsSync(tsconfig)) targets.push(tsconfig);
    }
  }

  let modified = 0;
  for (const tsconfig of targets) {
    if (!ctx.apply) {
      logger.print(`DRY: would ensure "@/*": ["./src/*"] in ${tsconfig.replace(ctx.repoRoot + "/", "")}`);
      continue;
    }
    const r = ensureTsconfigPaths(tsconfig, "@/*", "./src/*");
    if (r.modified) {
      logger.log({ op: "write", path: tsconfig, bytes: 0 });
      logger.print(`  UPDATE ${tsconfig.replace(ctx.repoRoot + "/", "")}`);
      modified++;
    } else {
      logger.log({ op: "skip", reason: "already-present", target: tsconfig });
    }
  }

  logger.summary(`modified=${modified}/${targets.length} dry=${!ctx.apply}`);
  logger.print(`done: modified=${modified}/${targets.length} tsconfigs`);
}
