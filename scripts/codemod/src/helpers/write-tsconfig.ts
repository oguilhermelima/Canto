import { readFileSync, writeFileSync } from "node:fs";

/**
 * Read a tsconfig.json (possibly with // comments), parse, merge compilerOptions.paths,
 * write back preserving formatting for commented files is best-effort.
 *
 * For our case, tsconfig files in this repo are plain JSON (verified) so we use JSON.parse/stringify.
 */
export function ensureTsconfigPaths(
  tsconfigPath: string,
  alias: string,
  target: string,
): { modified: boolean; before?: unknown; after?: unknown } {
  const raw = readFileSync(tsconfigPath, "utf8");
  const parsed = JSON.parse(raw) as {
    compilerOptions?: {
      baseUrl?: string;
      paths?: Record<string, string[]>;
    };
  };

  const before = parsed.compilerOptions?.paths ? { ...parsed.compilerOptions.paths } : undefined;

  parsed.compilerOptions ??= {};
  parsed.compilerOptions.baseUrl ??= ".";
  parsed.compilerOptions.paths ??= {};

  const existing = parsed.compilerOptions.paths[alias];
  if (existing && existing.length === 1 && existing[0] === target) {
    return { modified: false, before, after: before };
  }
  parsed.compilerOptions.paths[alias] = [target];

  writeFileSync(tsconfigPath, JSON.stringify(parsed, null, 2) + "\n");
  return { modified: true, before, after: parsed.compilerOptions.paths };
}

export function removeTsconfigPath(tsconfigPath: string, alias: string): boolean {
  const raw = readFileSync(tsconfigPath, "utf8");
  const parsed = JSON.parse(raw) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  if (!parsed.compilerOptions?.paths?.[alias]) return false;
  delete parsed.compilerOptions.paths[alias];
  writeFileSync(tsconfigPath, JSON.stringify(parsed, null, 2) + "\n");
  return true;
}
