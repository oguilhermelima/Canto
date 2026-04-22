import { resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

import pc from "picocolors";

import type { CodemodContext } from "../context.ts";
import { isDomainMove } from "../plan/schema.ts";

export interface Finding {
  severity: "error" | "warn";
  check: string;
  detail: string;
}

export function runVerify(ctx: CodemodContext, options: { planOnly?: boolean } = {}): Finding[] {
  const findings: Finding[] = [];
  const { plan, repoRoot } = ctx;

  // Plan-only: structural sanity against current disk (source paths exist, no duplicate targets).
  const corePackageRoot = resolve(repoRoot, plan.packageRoot);

  // Duplicate target check
  const domainTargets = plan.domainClassification
    .map((e) => {
      if (isDomainMove(e)) return e.to;
      if ("action" in e && e.action === "rename-sibling") return e.to;
      return undefined;
    })
    .filter((x): x is string => !!x);
  const dupDomain = findDuplicates(domainTargets);
  if (dupDomain.length) findings.push({ severity: "error", check: "duplicate-domain-targets", detail: dupDomain.join(", ") });

  const infraTargets = plan.infraMoves.map((m) => m.to);
  const dupInfra = findDuplicates(infraTargets);
  if (dupInfra.length) findings.push({ severity: "error", check: "duplicate-infra-targets", detail: dupInfra.join(", ") });

  // Source existence check — two forms:
  //   pre-restructure: sources should exist at `from` paths.
  //   post-restructure: sources were moved; `to` paths exist.
  const srcPrefix = "src/";
  let preMatches = 0;
  let postMatches = 0;
  const missingBoth: string[] = [];
  for (const e of plan.domainClassification) {
    const fromAbs = resolve(corePackageRoot, `${srcPrefix}${e.from}`);
    let toRel: string | undefined;
    if (isDomainMove(e)) toRel = e.to;
    else if ("action" in e && e.action === "rename-sibling") toRel = e.to;
    const toAbs = toRel ? resolve(corePackageRoot, `${srcPrefix}${toRel}`) : undefined;
    if (existsSync(fromAbs)) preMatches++;
    else if (toAbs && existsSync(toAbs)) postMatches++;
    else missingBoth.push(`${e.from}${toRel ? ` -> ${toRel}` : ""}`);
  }
  for (const m of plan.infraMoves) {
    const fromAbs = resolve(corePackageRoot, `${srcPrefix}${m.from}`);
    const toAbs = resolve(corePackageRoot, `${srcPrefix}${m.to}`);
    if (existsSync(fromAbs)) preMatches++;
    else if (existsSync(toAbs)) postMatches++;
    else missingBoth.push(`${m.from} -> ${m.to}`);
  }
  if (missingBoth.length) findings.push({ severity: "error", check: "missing-both-from-and-to", detail: missingBoth.slice(0, 10).join(" | ") });

  if (options.planOnly) {
    printReport(findings);
    return findings;
  }

  // Runtime integrity checks (post-restructure only)
  const runtime: Array<[string, () => void]> = [
    ["no-legacy-subpath-imports", () => checkGrepNegative(repoRoot, `@canto/core/infrastructure\\|@canto/core/lib`, ["packages", "apps"], findings)],
    ["no-tilde-in-web", () => checkGrepNegative(repoRoot, `from "~/`, ["apps/web/src"], findings)],
    ["domain-no-drizzle-value", () => checkGrepDomainDrizzle(repoRoot, findings)],
    ["domain-no-bullmq", () => checkGrepNegative(repoRoot, `from "bullmq`, ["packages/core/src/domain"], findings)],
    ["domain-no-ioredis", () => checkGrepNegative(repoRoot, `from "ioredis`, ["packages/core/src/domain"], findings)],
    ["exactly-one-index-ts", () => checkOneIndexTs(corePackageRoot, findings)],
  ];

  for (const [name, fn] of runtime) {
    try { fn(); } catch (err) {
      findings.push({ severity: "warn", check: name, detail: (err as Error).message });
    }
  }

  printReport(findings);
  return findings;
}

function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const a of arr) {
    if (seen.has(a)) dup.add(a);
    seen.add(a);
  }
  return [...dup];
}

function printReport(findings: Finding[]): void {
  if (findings.length === 0) {
    console.log(pc.green(`verify: 0 findings. OK.`));
    return;
  }
  for (const f of findings) {
    const tag = f.severity === "error" ? pc.red("ERROR") : pc.yellow("WARN");
    console.log(`${tag} [${f.check}] ${f.detail}`);
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  if (errors > 0) process.exitCode = 1;
}

function checkGrepNegative(repoRoot: string, pattern: string, paths: string[], findings: Finding[]): void {
  const allPaths = paths.map((p) => resolve(repoRoot, p)).filter(existsSync);
  if (allPaths.length === 0) return;
  try {
    const out = execSync(`grep -rln "${pattern}" ${allPaths.map((p) => JSON.stringify(p)).join(" ")} --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.cache --exclude-dir=.turbo 2>/dev/null || true`, { encoding: "utf8", cwd: repoRoot }).trim();
    if (out.length > 0) {
      findings.push({ severity: "error", check: "grep-negative", detail: `pattern="${pattern}" matches:\n${out.split("\n").slice(0, 8).join("\n")}` });
    }
  } catch {
    // grep returns non-zero when no match, that's fine
  }
}

function checkGrepDomainDrizzle(repoRoot: string, findings: Finding[]): void {
  const domainDir = resolve(repoRoot, "packages/core/src/domain");
  if (!existsSync(domainDir)) return;
  try {
    // Value imports from drizzle-orm or @canto/db (not `import type`) in domain = fail
    const out = execSync(`grep -rn "from \\"drizzle-orm\\|from \\"@canto/db" ${JSON.stringify(domainDir)} --include='*.ts' 2>/dev/null | grep -v "import type" || true`, { encoding: "utf8" }).trim();
    if (out.length > 0) {
      findings.push({ severity: "error", check: "domain-no-drizzle-value", detail: out.split("\n").slice(0, 8).join("\n") });
    }
  } catch {
    // ignore
  }
}

function checkOneIndexTs(corePackageRoot: string, findings: Finding[]): void {
  const srcAbs = resolve(corePackageRoot, "src");
  if (!existsSync(srcAbs)) return;
  const indexes: string[] = [];
  walkForName(srcAbs, "index.ts", indexes);
  if (indexes.length !== 1) {
    findings.push({ severity: "error", check: "exactly-one-index-ts", detail: `expected 1 src/index.ts, found: ${indexes.join(", ")}` });
  }
}

function walkForName(dir: string, name: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const sub = resolve(dir, entry.name);
    if (entry.isDirectory()) walkForName(sub, name, out);
    else if (entry.name === name) out.push(sub);
  }
}
