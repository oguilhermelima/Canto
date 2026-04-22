import { resolve } from "node:path";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";
import { rewriteSpecifierPrefix } from "../helpers/rewrite-imports.ts";
import { removeTsconfigPath } from "../helpers/write-tsconfig.ts";

/**
 * Rewrite ~/foo -> @/foo in apps/web (and any app with a legacy ~/* alias).
 */
export async function runMigrateTildeToAt(ctx: CodemodContext): Promise<void> {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "migrate-tilde-to-at", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const webAppRoot = resolve(ctx.repoRoot, "apps/web");
  const { project } = loadProject(webAppRoot);

  const r = rewriteSpecifierPrefix(project, "~/", "@/", logger);
  logger.print(`rewrites: ${r.rewrites} across ${r.files} files`);

  const expected = ctx.plan.aliases["apps/web"].expectedRewrites;
  const drift = Math.abs(r.rewrites - expected);
  if (drift > expected * 0.1) {
    logger.log({ op: "warn", message: `Rewrite count (${r.rewrites}) drifts >10% from expected (${expected}).` });
  }

  if (ctx.apply) {
    await project.save();
    const tsconfigPath = resolve(webAppRoot, "tsconfig.json");
    const removed = removeTsconfigPath(tsconfigPath, "~/*");
    if (removed) logger.print(`  REMOVE ~/* alias from apps/web/tsconfig.json`);
  }

  logger.summary(`rewrites=${r.rewrites} files=${r.files} expected=${expected} dry=${!ctx.apply}`);
}
