import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { requireSafeToMutate } from "../helpers/git.ts";

/**
 * Stub empty domain/<ctx>/types.ts for every context. Manual hand-write in Phase 7.
 */
export function runGenerateDomainTypes(ctx: CodemodContext, contextFilter?: string): void {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "generate-domain-types", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const srcAbs = resolve(ctx.repoRoot, ctx.plan.srcRoot);
  const contexts = contextFilter ? [contextFilter] : ctx.plan.contexts;

  let created = 0;
  for (const c of contexts) {
    const target = resolve(srcAbs, `domain/${c}/types.ts`);
    if (existsSync(target)) {
      logger.log({ op: "skip", reason: "already-exists", target });
      continue;
    }
    const content = `// TODO(architecture): hand-written domain types for ${c} context.\n// Prefer branded primitives for IDs, enums for statuses, no Drizzle imports here.\n\nexport {};\n`;
    if (ctx.apply) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    logger.log({ op: "write", path: target, bytes: content.length });
    logger.print(`  CREATE ${target.replace(ctx.repoRoot + "/", "")}`);
    created++;
  }
  logger.summary(`created=${created} dry=${!ctx.apply}`);
}
