import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";

import { Command } from "commander";

import { createContext } from "./context.ts";

function findRepoRoot(startDir: string): string {
  let current = resolve(startDir);
  for (let i = 0; i < 20; i++) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(startDir);
}
import { SafetyRailError } from "./helpers/git.ts";

import { runSplitErrors } from "./subcommands/split-errors.ts";
import { runClassifyDomain } from "./subcommands/classify-domain.ts";
import { runRestructureInfra } from "./subcommands/restructure-infra.ts";
import { runRenameDirs } from "./subcommands/rename-dirs.ts";
import { runSiblingBarrels } from "./subcommands/sibling-barrels.ts";
import { runCollapseExports } from "./subcommands/collapse-exports.ts";
import { runAddTsconfigPaths } from "./subcommands/add-tsconfig-paths.ts";
import { runMigrateTildeToAt } from "./subcommands/migrate-tilde-to-at.ts";
import { runGenerateDomainTypes } from "./subcommands/generate-domain-types.ts";
import { runGenerateMapperSkeletons } from "./subcommands/generate-mapper-skeletons.ts";
import { runVerify } from "./subcommands/verify.ts";
import { runMoveUseCases } from "./subcommands/move-use-cases.ts";

export async function runCli(argv: readonly string[]): Promise<void> {
  const program = new Command();
  program
    .name("codemod")
    .description("Canto core-architecture refactor codemod")
    .option("--repo <path>", "repo root", findRepoRoot(process.cwd()))
    .option("--plan <path>", "plan file path (defaults to src/plan/sample.json)")
    .option("--apply", "actually apply changes", false)
    .option("--yes", "skip interactive commit prompt (required together with --apply)", false);

  const makeCtx = () => {
    const opts = program.opts<{ repo: string; plan?: string; apply: boolean; yes: boolean }>();
    return createContext({
      repoRoot: resolve(opts.repo),
      planPath: opts.plan,
      dry: !opts.apply,
      apply: opts.apply && opts.yes,
      yes: opts.yes,
    });
  };

  program.command("split-errors").action(async () => { await runSplitErrors(makeCtx()); });
  program.command("classify-domain").action(async () => { await runClassifyDomain(makeCtx()); });
  program.command("restructure-infra").action(async () => { await runRestructureInfra(makeCtx()); });
  program.command("rename-dirs").action(() => { runRenameDirs(makeCtx()); });
  program.command("sibling-barrels").action(async () => { await runSiblingBarrels(makeCtx()); });
  program.command("collapse-exports").action(() => { runCollapseExports(makeCtx()); });
  program.command("add-tsconfig-paths").action(() => { runAddTsconfigPaths(makeCtx()); });
  program.command("migrate-tilde-to-at").action(async () => { await runMigrateTildeToAt(makeCtx()); });
  program.command("move-use-cases").action(async () => { await runMoveUseCases(makeCtx()); });
  program.command("generate-domain-types").option("--context <name>").action(async (opts: { context?: string }) => {
    runGenerateDomainTypes(makeCtx(), opts.context);
  });
  program.command("generate-mapper-skeletons").option("--context <name>").action(async (opts: { context?: string }) => {
    runGenerateMapperSkeletons(makeCtx(), opts.context);
  });
  program.command("verify").option("--plan-only", "structural sanity only", false).action((opts: { planOnly?: boolean }) => {
    runVerify(makeCtx(), { planOnly: opts.planOnly });
  });

  try {
    await program.parseAsync(["node", "codemod", ...argv]);
  } catch (err) {
    if (err instanceof SafetyRailError) {
      console.error("\nSAFETY RAIL:", err.message);
      process.exitCode = 2;
      return;
    }
    throw err;
  }
}
