import { readFileSync, writeFileSync } from "node:fs";

export function rewritePackageExports(
  packageJsonPath: string,
  exportsTarget: Record<string, unknown>,
): { modified: boolean; before: unknown; after: unknown } {
  const raw = readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { exports?: unknown };
  const before = parsed.exports;
  parsed.exports = exportsTarget;
  const after = parsed.exports;
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return { modified: false, before, after };
  }
  writeFileSync(packageJsonPath, JSON.stringify(parsed, null, 2) + "\n");
  return { modified: true, before, after };
}
