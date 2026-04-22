import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { requireSafeToMutate } from "../helpers/git.ts";

/**
 * For each repository under infra/<ctx>/*-repository.ts, scaffold <entity>.mapper.ts
 * with toDomain/toRow stubs throwing notImplemented.
 */
export function runGenerateMapperSkeletons(ctx: CodemodContext, contextFilter?: string): void {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "generate-mapper-skeletons", dry: ctx.dry, apply: ctx.apply });
  if (ctx.apply) requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });

  const srcAbs = resolve(ctx.repoRoot, ctx.plan.srcRoot);
  const infraAbs = resolve(srcAbs, "infra");
  if (!existsSync(infraAbs)) {
    logger.log({ op: "warn", message: "infra/ directory missing; run restructure-infra first." });
    return;
  }

  const contexts = contextFilter ? [contextFilter] : readdirSync(infraAbs).filter((d) => statSync(resolve(infraAbs, d)).isDirectory());

  let created = 0;
  for (const c of contexts) {
    const ctxDir = resolve(infraAbs, c);
    if (!existsSync(ctxDir)) continue;
    for (const file of readdirSync(ctxDir)) {
      if (!file.endsWith("-repository.ts")) continue;
      const entity = file.replace(/-repository\.ts$/, "");
      const mapperTarget = resolve(ctxDir, `${entity}.mapper.ts`);
      if (existsSync(mapperTarget)) {
        logger.log({ op: "skip", reason: "already-exists", target: mapperTarget });
        continue;
      }
      const pascal = entity.split(/[-_]/).map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : "")).join("");
      const content = `// TODO(architecture): ${entity} mapper — fill with hand-written toDomain/toRow.\n// Drizzle types may be imported here (infra is allowed to see @canto/db schema).\n\nimport type { ${pascal} } from "@canto/core/domain/${c}/types";\n\nexport function toDomain(_row: unknown): ${pascal} {\n  throw new Error("${entity}.mapper.toDomain: not implemented");\n}\n\nexport function toRow(_entity: ${pascal}): unknown {\n  throw new Error("${entity}.mapper.toRow: not implemented");\n}\n`;
      if (ctx.apply) {
        mkdirSync(dirname(mapperTarget), { recursive: true });
        writeFileSync(mapperTarget, content);
      }
      logger.log({ op: "write", path: mapperTarget, bytes: content.length });
      logger.print(`  CREATE ${mapperTarget.replace(ctx.repoRoot + "/", "")}`);
      created++;
    }
  }
  logger.summary(`created=${created} dry=${!ctx.apply}`);
}
