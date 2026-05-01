---
name: handbook
description: Canto project handbook — architectural rules, patterns, and design system reference. Use when writing, reviewing, or planning code in apps/web, apps/worker, packages/core, or packages/api. Also triggers on "how do we structure X", "where does Y live", "review this against the handbook".
---

# Canto Handbook

Project-wide architectural reference for Canto (T3 Turbo: Next.js 15, React 19, Expo, tRPC v11, Drizzle, PostgreSQL, BullMQ + Redis, better-auth).

## How to use this skill

Before writing or reviewing code, open the file that matches the scope you're touching:

| Scope | File | Covers |
|---|---|---|
| Web UI | `frontend.md` | `apps/web` pages, components, design system, UX states |
| Domain/use-cases | `core.md` | `packages/core` clean-architecture rules |
| tRPC layer | `api.md` | `packages/api` router thinness, validator placement |
| Background jobs | `worker.md` | `apps/worker` BullMQ patterns, retry/log policy |

For a cross-cutting change (e.g. moving a Zod schema from a router to validators, or extracting a component primitive to `@canto/ui`), read the target file AND the source file.

## Project shape (T3 Turbo)

```
apps/
├── web/              # Next.js 15 web app
├── mobile/           # Expo (planned)
└── worker/           # BullMQ consumer
packages/
├── api/              # tRPC v11 routers (thin)
├── auth/             # better-auth config
├── core/             # Domain use-cases + infrastructure (clean arch)
├── db/               # Drizzle schema + client
├── providers/        # TMDB/TVDB normalized to NormalizedMedia
├── ui/               # Shared shadcn-style primitives
└── validators/       # Zod — single source of truth for inputs
tooling/
├── eslint/ prettier/ tailwind/ typescript/
```

## Shared non-negotiables

These apply across every scope.

1. **Single Media entity** — one `media` table with a `type` discriminator. Movies and shows share one persistence path, one resolve path, one render chain.
2. **Provider-agnostic** — TMDB/TVDB/AniList all normalize to `NormalizedMedia` inside `packages/providers`. Provider-specific field names stay inside the adapter.
3. **No `any`** — use `unknown` and narrow.
4. **Zod lives in `packages/validators`** — every tRPC input is a named exported schema, and types flow via `z.infer<>`.
5. **Business logic lives in `packages/core`** — routers, components, and workers are orchestration glue.
6. **No `useEffect` for data fetching** — use tRPC `useQuery` / `useMutation` / `useInfiniteQuery`. Invalidate via `utils.<router>.<procedure>.invalidate()`.
7. **No `useEffect` for state sync** — use the "adjust state during render" pattern (`useState` + `if (prev !== current) setX(current)`) or `useSyncExternalStore`.
8. **File naming** — kebab-case files, PascalCase components.
9. **No framework imports in `packages/core/domain/`** — no `@trpc/server`, no Next.js, no Expo, no React, no `bullmq`, no `ioredis`.
10. **Empty/error/end states are space-themed** — use `StateMessage` from `@canto/ui` with a preset from `@canto/ui/presets/space-states`.
11. **No opacity modifiers on text colors** — `text-foreground/70`, `text-muted-foreground/60` are forbidden. Text stays full-opacity for readability. Opacity on **borders**, **buttons**, and **backgrounds** is fine and expected for visual polish.
12. **Use `TabBar` from `@canto/ui`** — any horizontal toggle of 2+ options uses the shared primitive.
13. **Imports use `@canto/<pkg>/<full-path>` everywhere.** Zero `./` or `../`. Move-safe + consistent.

## Ports map (per context)

`packages/core` is hexagonal. Each context owns its repo port; cross-cutting concerns live in `domain/shared/ports/`.

| Context | Ports |
|---|---|
| `notifications` | `NotificationsRepositoryPort` |
| `user` | `UserRepositoryPort` |
| `lists` | `ListsRepositoryPort` (covers list + listItem + listMember + listInvitation tables) |
| `recommendations` | `RecommendationsRepositoryPort`, `RecommendationsCatalogPort` |
| `trakt` | `TraktRepositoryPort`, `TraktApiPort`, `TraktAuthPort` |
| `media-servers` | `UserConnectionRepositoryPort`, `PlexAdapterPort`, `JellyfinAdapterPort`, `MediaServerPort` (read+write), `ServerCredentialsPort`, `MediaVersionRepositoryPort` |
| `user-media` | `UserMediaRepositoryPort`, `LibraryFeedRepositoryPort`, `MediaServerPushPort` |
| `torrents` | `TorrentsRepositoryPort` |
| `file-organization` | `FoldersRepositoryPort` |
| `media` | `MediaRepositoryPort`, `MediaLocalizationRepositoryPort`, `MediaAspectStateRepositoryPort`, `MediaContentRatingRepositoryPort`, `MediaExtrasRepositoryPort` |
| `shared` | `LoggerPort`, `JobDispatcherPort`, `CachePort`, `MediaProviderPort`, `FileSystemPort`, `DownloadClientPort` |

## Composition root

`packages/core/src/composition/core-deps.ts` exports `buildCoreDeps(db): CoreDeps`. Worker entries + tRPC routers call it instead of constructing each adapter manually:

```ts
const deps = buildCoreDeps(ctx.db);
await myUseCase(input, deps);
```

`PersistDeps` (media persist orchestration) is a separate factory at `composition/persist-deps.ts` — used by media-context flows that need persist + media + localization wired together.

## Commit message style

- Conventional commits in English: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Subject < 60 chars when possible. Format: `<type>(<scope>): <verb> <object>`
- Atomic — one logical change per commit
- No co-author tags
- No emojis
- **No wave/phase/round identifiers** in subject or body — refactor history lives in git log + PR descriptions

## Anti-bad-smells (canonical reference)

For the full list (16 antipatterns + SOLID checklist), see `.claude/handbook/refactor-history.md` (archive of the refactor doc). Highlights:

- No defensive null/undefined checks where TS already guarantees non-null.
- No `==` / `!=` — use strict equality with explicit `=== null || === undefined` if both must be checked.
- No `!` non-null assertion — use guard clauses, optional chains, or `find()` with narrowing.
- No `||` where `??` is correct (only diverge on `""` / `0` / `false`).
- No comments narrating refactor history (`// was: X`, `// removed Y`, phase/wave references) — commit messages own that.
- No premature DRY — wait for 4-5 sites with same semantics before extracting.
