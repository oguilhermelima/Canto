# Canto — Project Guide

## Stack (T3 Turbo)

- **Monorepo**: Turborepo with pnpm workspaces
- **Web**: Next.js 15, React 19, Tailwind CSS v4, shadcn/ui
- **Mobile**: Expo SDK 54, React Native 0.81, NativeWind v5, Expo Router
- **API**: tRPC v11 (shared between web + mobile)
- **Database**: PostgreSQL 18, Drizzle ORM, UUIDv7 primary keys
- **Auth**: better-auth (shared package)
- **Background Jobs**: BullMQ + Redis
- **Torrent Client**: qBittorrent (WebUI API)
- **Indexer**: Prowlarr/Jackett
- **Infra**: Docker Compose, Colima (macOS, 4 CPU / 4GB RAM)

## Project Structure (T3 Turbo pattern)

```
apps/
├── web/              # Next.js 15 web app
├── mobile/           # Expo React Native app
└── worker/           # Background jobs (BullMQ consumer)

packages/
├── api/              # tRPC v11 router definitions (thin layer)
├── auth/             # better-auth config + schemas
├── core/             # Domain logic, infrastructure, shared lib
├── db/               # Drizzle ORM schema + client
├── ui/               # Shared React components (shadcn/ui)
├── providers/        # TMDB, AniList, TVDB — normalized output
└── validators/       # Shared Zod schemas

tooling/
├── eslint/           # Shared ESLint config
├── prettier/         # Shared Prettier config
├── tailwind/         # Shared Tailwind config
└── typescript/       # Shared tsconfig
```

## Architecture

`packages/core` is ports-and-adapters (hexagonal):

- **Domain** (`domain/<context>/`) — pure business logic. No framework imports, no direct I/O, no `drizzle-orm` runtime helpers. Use cases declare deps via interface (`deps: { repo: FooRepositoryPort, logger: LoggerPort, ... }`).
- **Ports** (`domain/<context>/ports/*.port.ts` + `domain/shared/ports/*.port.ts`) — interfaces that domain depends on.
- **Infra** (`infra/<context>/`) — adapters that implement ports against Drizzle, qBittorrent, TMDB, etc.
- **Composition root** (`composition/core-deps.ts`) — `buildCoreDeps(db)` wires every port to its adapter. Worker entry + tRPC context call it instead of constructing each adapter manually.

Single Media entity (movies + shows in one `media` table, `type` discriminator). Provider-agnostic (TMDB/TVDB/AniList → `NormalizedMedia`). UUIDv7 keys everywhere. tRPC procedures defined once in `packages/api`, consumed by web + mobile.

Detailed rules + port maps + anti-patterns in `.claude/skills/handbook/SKILL.md` and the per-scope files (`core.md`, `api.md`, `frontend.md`, `worker.md`). Refactor history archived at `.claude/handbook/refactor-history.md`.

## Critical rules

1. **No comments inline by default.** Code well-named already says what it does. Use JSDoc above public functions only when WHY is non-obvious (1 sentence + 1 particularity).
2. **Port-first / deps injection in `domain/`.** Never import `@canto/core/infra/*` or `@canto/core/platform/*` from `domain/**`. Thread via interface deps.
3. **Imports use `@canto/<pkg>/<full-path>` everywhere.** Zero `./` or `../`. Move-safe + consistent.
4. **No `any`, no `==/!=` (use `===/!==`), no `||` where `??` is correct.** No `!` non-null assertions — use guard clauses, optional chains, or `find()` with narrowing.
5. **Drizzle runtime helpers stay in `infra/`.** `import type` from `drizzle-orm` is fine in domain types.

## Commit rules

- Conventional commits in English: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Subject < 60 chars when possible. Format: `<type>(<scope>): <verb> <object>`
- Atomic — one logical change per commit
- No co-author tags
- No emojis
- No wave/phase/round identifiers in subject or body — refactor history lives in git log + PR descriptions

## What NOT to do

- Don't duplicate logic between media types — one service handles both movies and shows
- Don't call external APIs for data already in the DB
- Don't add fields to the DB that aren't populated
- Don't create separate endpoints for movies and shows when the logic is identical
- Don't put business logic in React components — keep it in tRPC procedures
- Don't use `useEffect` for data fetching — use tRPC hooks (`useQuery`, `useMutation`)
- Don't use `useEffect` to sync state from props — use the "adjust state during render" pattern (`useState` + `if (prev !== current) setX(current)`)
