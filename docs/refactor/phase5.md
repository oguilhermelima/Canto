Phase 5 — verification after scripted restructure

## What's green
- `pnpm turbo run typecheck`: 10/10 packages green
- `pnpm -F @canto/core test`: 59/59 tests pass (matches baseline)
- No `@canto/core/infrastructure` or `@canto/core/lib` specifiers anywhere
- No `from "~/` imports in apps/web (0, previously 477)
- `find packages/core/src -name index.ts` returns exactly 1 path: `src/index.ts`
- `packages/core/package.json` exports collapsed to single `./*` wildcard
- 9/9 tsconfigs expose `@/* -> ./src/*` alias

## What's red (expected; feeds Phase 6 and Phase 7)
- `domain/**/*.ts` still has Drizzle / @canto/db value imports. Catalog:
  - `domain/media-servers/use-cases/update-metadata.ts`: @canto/db/settings
  - `domain/media-servers/use-cases/authenticate/plex.ts`: @canto/db/settings
  - `domain/media-servers/use-cases/discover-libraries.ts`: drizzle-orm, @canto/db/schema
  - `domain/media-servers/use-cases/trigger-scans.ts`: @canto/db/settings
  - `domain/torrents/use-cases/import-torrent.ts`: @canto/db/settings
  - `domain/torrents/rules/folder-routing.ts`: @canto/db/schema
  - `domain/trakt/use-cases/sync-custom-lists.ts`: drizzle-orm
  - (+ more — full list produced by `pnpm codemod verify`)
- `domain/*` still imports some infra via the transitional aggregate at
  `src/infra/repositories.ts` (sync-pipeline, persist, download-torrent,
  media-servers authenticate/fetch-info/sync-libraries).
  Phase 6 (port-first refactor) eliminates these.

## What to verify manually (dev servers)
Auto mode does not boot dev servers. Before merging to main, run:
- `pnpm -F @canto/web dev` (boot on :3000; exercise /lists, /media, /settings/services)
- `pnpm -F @canto/worker dev` (pick up a job end-to-end)
- `pnpm -F @canto/web build` (Turbopack production build)

## Verify subcommand findings (informational)
The `pnpm codemod verify` command flags:
- `missing-both-from-and-to` for three old barrel files (ports/index.ts,
  rules/index.ts, types/index.ts, errors.ts) — expected; they were
  deleted by split-errors + classify-domain and have no target-path entry.
- Domain -> Drizzle value imports (see red list above). These are
  Phase 7 scope; the current structural refactor is complete.

## Commits on this branch

refactor/core-architecture:
  d5bae711  chore(refactor): carry-over transitional state
  b272a74f  chore(refactor): baseline snapshot + codemod workspace scaffold
  d2e01713  chore(refactor): commit reviewed codemod-plan.json
  3b7d6c69  feat(codemod): implement ts-morph subcommands for core refactor
  1f5c47e0  feat(codemod): rewrite cross-workspace specifiers after in-core moves
  f67d7eeb  fix(codemod): split-errors handles all 20 error classes
  a0826a54  refactor(core): split domain/errors.ts into per-context errors
  82439eb0  refactor(core): classify domain files + collapse exports to wildcard
  1eddd8f8  refactor(core): move infra to infra/<ctx>/ + platform/<concern>/
  3e45c645  refactor(core): sibling-barrel convention + empty root index
  8bfa7bc5  refactor(core): move use-cases into domain/<ctx>/use-cases/
  2dad13ea  refactor(repo): unify @/* tsconfig paths across all packages and apps
  359c9af7  refactor(web): migrate ~/* -> @/* across apps/web (477 rewrites)
