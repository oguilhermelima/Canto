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
├── api/              # tRPC v11 router definitions
├── auth/             # better-auth config + schemas
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

## Architecture Principles

- **Single Media entity**: Movies and TV shows share one `media` table with a `type` discriminator. No separate movie/show tables.
- **Provider-agnostic**: All metadata providers (TMDB, AniList, TVDB) normalize to the same `NormalizedMedia` type. Provider quirks are handled in the provider layer, never in the service/router layer.
- **Persist on visit**: When a user previews a media item, we fetch full metadata and persist it. Adding to library is just flipping `in_library = true`.
- **Extras are cached, not re-fetched**: Credits, similar, recommendations are fetched once and cached in DB. Core metadata (genres, score, backdrop) lives directly on the media row.
- **UUIDv7 everywhere**: All primary keys use UUIDv7 (time-sortable, globally unique).
- **One router, all platforms**: tRPC procedures are defined once in `packages/api`, consumed by both Next.js and Expo.

## Commit Rules

- Conventional commits in English: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Atomic commits — one logical change per commit
- No co-author tags
- No emojis in commit messages

## Code Style

- TypeScript strict mode
- Prefer `const` over `let`
- Prefer explicit return types on exported functions
- Drizzle schema is the single source of truth for DB types
- tRPC procedures use Zod for input validation
- Tailwind for styling, no CSS modules
- No `any` types — use `unknown` and narrow
- React components: function components only, no class components
- File naming: kebab-case for files, PascalCase for components

## What NOT to do

- Don't duplicate logic between media types — one service handles both movies and shows
- Don't call external APIs for data already in the DB
- Don't add fields to the DB that aren't populated
- Don't create separate endpoints for movies and shows when the logic is identical
- Don't put business logic in React components — keep it in tRPC procedures
- Don't use `useEffect` for data fetching — use tRPC hooks (`useQuery`, `useMutation`)
