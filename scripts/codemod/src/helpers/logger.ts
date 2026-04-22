import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

export type LogOp =
  | { op: "move"; from: string; to: string; importersTouched: string[] }
  | { op: "delete"; path: string; reason: string }
  | { op: "rename-sibling"; from: string; to: string }
  | { op: "mkdir"; path: string }
  | { op: "write"; path: string; bytes: number }
  | { op: "rewrite-import"; file: string; from: string; to: string }
  | { op: "split-error"; className: string; from: string; to: string; importersTouched: number }
  | { op: "skip"; reason: string; target?: string }
  | { op: "warn"; message: string }
  | { op: "info"; message: string };

export interface CodemodLogger {
  readonly runDir: string;
  log(op: LogOp): void;
  summary(text: string): void;
  print(line: string): void;
  dry: boolean;
  apply: boolean;
}

export function createLogger(params: {
  repoRoot: string;
  subcommand: string;
  dry: boolean;
  apply: boolean;
}): CodemodLogger {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = join(params.repoRoot, ".codemod", `${ts}-${params.subcommand}`);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run.log"), "");
  writeFileSync(join(runDir, "summary.md"), `# ${params.subcommand}\n\n`);

  const logger: CodemodLogger = {
    runDir,
    dry: params.dry,
    apply: params.apply,
    log(op) {
      appendFileSync(join(runDir, "run.log"), JSON.stringify(op) + "\n");
    },
    summary(text) {
      appendFileSync(join(runDir, "summary.md"), text + "\n");
    },
    print(line) {
      console.log(line);
    },
  };

  logger.print(
    `${pc.cyan("[" + params.subcommand + "]")} ${params.apply ? pc.red("APPLY") : pc.yellow("DRY RUN")}  log: ${runDir}`,
  );
  return logger;
}
