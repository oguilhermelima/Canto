# @canto/codemod

Private workspace tool that drives the `refactor/core-architecture` migration.

See `/Users/gui/.claude/plans/fuzzy-pondering-glade.md` for the full plan.

## Subcommands (Phase 3)

- `split-errors` — split `domain/errors.ts` by context
- `classify-domain` — move domain files into bounded-context folders
- `restructure-infra` — move infra/lib into `infra/<ctx>/` and `platform/<concern>/`
- `rename-dirs` — finalize `infrastructure/` → `infra/`, `lib/` → `platform/`
- `sibling-barrels` — convert `<folder>/index.ts` into sibling `<folder>.ts`
- `collapse-exports` — collapse `packages/core/package.json` exports to `"./*": "./src/*.ts"`
- `add-tsconfig-paths` — add `"@/*": ["./src/*"]` to every package/app tsconfig
- `migrate-tilde-to-at` — rewrite `~/foo` → `@/foo` in `apps/web/src`
- `generate-domain-types` — scaffold per-context `domain/<ctx>/types.ts`
- `generate-mapper-skeletons` — scaffold per-entity `infra/<ctx>/<entity>.mapper.ts`
- `verify` — read-only sanity checks used in CI

## Safety rails

Every mutating subcommand requires:
- clean working tree
- current branch equals `plan.branch` (`refactor/core-architecture`)
- branch is remote-tracked and fully pushed
- explicit `--apply --yes --token=<hash>` after reviewing dry-run output

## Plan source of truth

`src/plan/sample.json` is the reviewed codemod plan. Edit it, then re-run
subcommands; changes reflect without touching subcommand code.
