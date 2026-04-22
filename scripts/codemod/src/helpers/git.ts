import { execSync } from "node:child_process";

export interface GitOptions {
  cwd: string;
  expectedBranch: string;
}

export class SafetyRailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyRailError";
  }
}

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: "utf8" }).trim();
}

export function assertCleanTree(cwd: string): void {
  const status = git(cwd, "status --porcelain");
  if (status.length > 0) {
    throw new SafetyRailError(
      `Working tree is dirty. Commit or stash before running a mutating codemod:\n${status}`,
    );
  }
}

export function assertBranch(cwd: string, expected: string): void {
  const branch = git(cwd, "rev-parse --abbrev-ref HEAD");
  if (branch !== expected) {
    throw new SafetyRailError(
      `Current branch is '${branch}'; codemod requires '${expected}'. Refusing to run.`,
    );
  }
}

export function assertRemoteTracked(cwd: string): void {
  try {
    git(cwd, "rev-parse --abbrev-ref --symbolic-full-name @{u}");
  } catch {
    throw new SafetyRailError(
      "Branch is not remote-tracked. Push the branch before running a mutating codemod.",
    );
  }
  const unpushed = git(cwd, "rev-list @{u}..HEAD");
  if (unpushed.length > 0) {
    throw new SafetyRailError(
      "Branch has unpushed commits. Push before running (prior incident lost local work).",
    );
  }
}

export function requireSafeToMutate(options: GitOptions): void {
  assertCleanTree(options.cwd);
  assertBranch(options.cwd, options.expectedBranch);
  assertRemoteTracked(options.cwd);
}

export function gitMove(cwd: string, from: string, to: string): void {
  execSync(`git mv ${JSON.stringify(from)} ${JSON.stringify(to)}`, { cwd, stdio: "pipe" });
}
