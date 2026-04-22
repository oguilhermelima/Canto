import type { Project } from "ts-morph";

import type { CodemodLogger } from "./logger.ts";

/**
 * Walk every loaded source file and rewrite module specifiers that start with `fromPrefix`
 * to start with `toPrefix` instead. Covers import declarations, export declarations, and
 * dynamic `import()` / `require()` calls that resolve to module specifiers.
 */
export function rewriteSpecifierPrefix(
  project: Project,
  fromPrefix: string,
  toPrefix: string,
  logger: CodemodLogger,
): { files: number; rewrites: number } {
  let files = 0;
  let rewrites = 0;

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    let touched = 0;

    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      if (spec.startsWith(fromPrefix)) {
        const replaced = toPrefix + spec.slice(fromPrefix.length);
        imp.setModuleSpecifier(replaced);
        logger.log({ op: "rewrite-import", file: filePath, from: spec, to: replaced });
        touched++;
        rewrites++;
      }
    }
    for (const exp of sf.getExportDeclarations()) {
      const spec = exp.getModuleSpecifierValue();
      if (spec && spec.startsWith(fromPrefix)) {
        const replaced = toPrefix + spec.slice(fromPrefix.length);
        exp.setModuleSpecifier(replaced);
        logger.log({ op: "rewrite-import", file: filePath, from: spec, to: replaced });
        touched++;
        rewrites++;
      }
    }

    if (touched > 0) files++;
  }

  return { files, rewrites };
}

/**
 * Rewrite exact-match module specifiers (not prefix) across the project.
 */
export function rewriteSpecifierExact(
  project: Project,
  matchers: ReadonlyMap<string, string>,
  logger: CodemodLogger,
): { files: number; rewrites: number } {
  let files = 0;
  let rewrites = 0;

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    let touched = 0;

    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      const replaced = matchers.get(spec);
      if (replaced) {
        imp.setModuleSpecifier(replaced);
        logger.log({ op: "rewrite-import", file: filePath, from: spec, to: replaced });
        touched++;
        rewrites++;
      }
    }
    for (const exp of sf.getExportDeclarations()) {
      const spec = exp.getModuleSpecifierValue();
      if (!spec) continue;
      const replaced = matchers.get(spec);
      if (replaced) {
        exp.setModuleSpecifier(replaced);
        logger.log({ op: "rewrite-import", file: filePath, from: spec, to: replaced });
        touched++;
        rewrites++;
      }
    }

    if (touched > 0) files++;
  }

  return { files, rewrites };
}
