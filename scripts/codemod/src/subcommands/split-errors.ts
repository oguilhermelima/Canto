import { resolve, dirname } from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

import type { ClassDeclaration, ImportDeclaration, ImportSpecifier, SourceFile } from "ts-morph";

import type { CodemodContext } from "../context.ts";
import { createLogger } from "../helpers/logger.ts";
import { loadProject } from "../helpers/ts-project.ts";
import { requireSafeToMutate } from "../helpers/git.ts";

export interface SplitErrorsResult {
  filesCreated: number;
  classesMoved: number;
  importersRewritten: number;
  dry: boolean;
}

/**
 * Split packages/core/src/domain/errors.ts into per-context errors files based on plan.errorAssignments.
 * Importers of "@canto/core/domain/errors" and "../errors" (or similar) are rewritten per class.
 */
export async function runSplitErrors(ctx: CodemodContext): Promise<SplitErrorsResult> {
  const logger = createLogger({ repoRoot: ctx.repoRoot, subcommand: "split-errors", dry: ctx.dry, apply: ctx.apply });

  if (ctx.apply) {
    requireSafeToMutate({ cwd: ctx.repoRoot, expectedBranch: ctx.plan.branch });
  }

  const corePackageRoot = resolve(ctx.repoRoot, ctx.plan.packageRoot);
  const srcAbs = resolve(ctx.repoRoot, ctx.plan.srcRoot);
  const errorsFile = resolve(srcAbs, "domain/errors.ts");

  if (!existsSync(errorsFile)) {
    logger.print("errors.ts already split or missing; nothing to do.");
    logger.log({ op: "skip", reason: "errors.ts missing" });
    return { filesCreated: 0, classesMoved: 0, importersRewritten: 0, dry: ctx.dry };
  }

  const { project } = loadProject(corePackageRoot);
  const errorsSf = project.getSourceFile(errorsFile);
  if (!errorsSf) throw new Error("ts-morph did not load errors.ts");

  // Catalog declared classes + type aliases.
  const classDecls = new Map<string, ClassDeclaration>();
  for (const cls of errorsSf.getClasses()) {
    classDecls.set(cls.getName() ?? "", cls);
  }
  const typeAliases = new Map<string, ReturnType<SourceFile["getTypeAlias"]>>();
  for (const ta of errorsSf.getTypeAliases()) {
    typeAliases.set(ta.getName(), ta);
  }

  // Collect shared helpers we may need to export along with classes (e.g. DomainErrorCode type,
  // helper functions used by multiple error classes).
  const imports = errorsSf.getImportDeclarations().map((imp) => imp.getText()).join("\n");

  // Assign each class/type to its target context.
  const byContext = new Map<string, string[]>(); // context -> class names
  const symbolToContext = new Map<string, string>();
  for (const assignment of ctx.plan.errorAssignments) {
    const list = byContext.get(assignment.context) ?? [];
    list.push(assignment.className);
    byContext.set(assignment.context, list);
    symbolToContext.set(assignment.className, assignment.context);
  }

  // Build target content per context. Non-shared files import DomainError (+
  // any other base symbols they extend) from shared/errors.
  const sharedBases = new Set<string>();
  const sharedSymbols = byContext.get("shared") ?? [];
  for (const name of sharedSymbols) sharedBases.add(name);

  const filesCreated: { path: string; content: string }[] = [];
  for (const [context, symbols] of byContext) {
    const target = context === "shared"
      ? resolve(srcAbs, "domain/shared/errors.ts")
      : resolve(srcAbs, `domain/${context}/errors.ts`);

    const emitted: string[] = [];
    if (imports.trim().length > 0) {
      emitted.push(imports);
    }

    // For non-shared files, inject an import for every shared symbol referenced
    // by the classes we're about to emit (most often DomainError; also
    // DomainErrorCode type when referenced in `readonly code: DomainErrorCode`).
    if (context !== "shared") {
      const needed = new Set<string>();
      for (const name of symbols) {
        const cls = classDecls.get(name);
        if (!cls) continue;
        const text = cls.getText();
        for (const candidate of sharedBases) {
          if (text.includes(candidate)) needed.add(candidate);
        }
      }
      if (needed.size > 0) {
        const valueBases = [...needed].filter((n) => classDecls.has(n));
        const typeBases = [...needed].filter((n) => typeAliases.has(n));
        const parts: string[] = [];
        if (valueBases.length > 0) {
          parts.push(`import { ${valueBases.join(", ")} } from "../shared/errors";`);
        }
        if (typeBases.length > 0) {
          parts.push(`import type { ${typeBases.join(", ")} } from "../shared/errors";`);
        }
        if (parts.length > 0) emitted.push(parts.join("\n"));
      }
    }

    for (const name of symbols) {
      const cls = classDecls.get(name);
      const ta = typeAliases.get(name);
      if (cls) {
        emitted.push(cls.getText());
      } else if (ta) {
        emitted.push(ta.getText());
      } else {
        logger.log({ op: "warn", message: `errorAssignments: no declaration for ${name} in errors.ts` });
      }
    }
    const content = emitted.join("\n\n") + "\n";
    filesCreated.push({ path: target, content });
  }

  // Rewrite importers of the old errors module to the new per-context modules.
  // Strategy: for every ImportDeclaration whose specifier resolves to errors.ts,
  // replace with per-class imports grouped by target module.
  const errorsAbsPath = errorsFile;
  let importersRewritten = 0;
  for (const sf of project.getSourceFiles()) {
    if (sf.getFilePath() === errorsAbsPath) continue;
    const imports = sf.getImportDeclarations();
    for (const imp of imports) {
      const moduleSf = imp.getModuleSpecifierSourceFile();
      if (!moduleSf || moduleSf.getFilePath() !== errorsAbsPath) continue;

      const byTarget = new Map<string, { value: string[]; type: string[]; defaultName?: string }>();
      const namedImports = imp.getNamedImports();
      const isTypeOnly = imp.isTypeOnly();

      for (const spec of namedImports) {
        const name = spec.getName();
        const alias = spec.getAliasNode()?.getText();
        const target = symbolToContext.get(name);
        if (!target) {
          logger.log({ op: "warn", message: `Unknown error symbol imported: ${name} in ${sf.getFilePath()}` });
          continue;
        }
        const newModule = target === "shared"
          ? "@canto/core/domain/shared/errors"
          : `@canto/core/domain/${target}/errors`;
        const bucket = byTarget.get(newModule) ?? { value: [], type: [] };
        const piece = alias ? `${name} as ${alias}` : name;
        if (isTypeOnly || spec.isTypeOnly()) bucket.type.push(piece);
        else bucket.value.push(piece);
        byTarget.set(newModule, bucket);
      }

      // Compose replacement imports.
      const replacements: string[] = [];
      for (const [module, bucket] of byTarget) {
        const parts: string[] = [];
        if (bucket.value.length > 0) {
          parts.push(`import { ${bucket.value.join(", ")} } from "${module}";`);
        }
        if (bucket.type.length > 0) {
          parts.push(`import type { ${bucket.type.join(", ")} } from "${module}";`);
        }
        replacements.push(...parts);
      }

      if (replacements.length > 0) {
        imp.replaceWithText(replacements.join("\n"));
        importersRewritten++;
      }
    }
  }

  logger.print(`plan: create ${filesCreated.length} files, remove errors.ts, rewrite ${importersRewritten} importers`);

  if (!ctx.apply) {
    for (const f of filesCreated) {
      logger.print(`  CREATE ${f.path.replace(ctx.repoRoot + "/", "")}`);
    }
    logger.print(`  DELETE ${errorsFile.replace(ctx.repoRoot + "/", "")}`);
    logger.summary(`DRY: ${filesCreated.length} files, ${importersRewritten} importers`);
    return { filesCreated: filesCreated.length, classesMoved: ctx.plan.errorAssignments.length, importersRewritten, dry: true };
  }

  // APPLY: write files, delete source, save project.
  for (const f of filesCreated) {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, f.content);
    logger.log({ op: "write", path: f.path, bytes: f.content.length });
  }
  errorsSf.delete();
  await project.save();

  logger.summary(`APPLIED: ${filesCreated.length} files, ${importersRewritten} importers rewritten`);
  return { filesCreated: filesCreated.length, classesMoved: ctx.plan.errorAssignments.length, importersRewritten, dry: false };
}
