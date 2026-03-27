# Canto — Project Plan

> *"Canto"* — Portuguese for "my corner", English for a chapter of an epic poem (Dante's Inferno, Iliad). Your personal corner for media, each title a chapter in your collection.

## What is Canto?

A self-hosted media management app for movies and TV shows. Fetches metadata from external providers (TMDB, AniList, TVDB), manages a personal library, handles torrent-based downloads with automatic file organization, and runs on web + mobile.

---

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Monorepo** | Turborepo + pnpm | latest |
| **Web** | Next.js | 15 |
| **Mobile** | Expo + React Native | SDK 54 / RN 0.81 |
| **React** | React | 19 |
| **Styling** | Tailwind CSS | v4 |
| **UI (web)** | shadcn/ui | latest |
| **UI (mobile)** | NativeWind | v5 |
| **Navigation (mobile)** | Expo Router | latest |
| **API** | tRPC | v11 |
| **Database** | PostgreSQL | 18 |
| **ORM** | Drizzle | latest |
| **Auth** | better-auth | latest |
| **Background jobs** | BullMQ + Redis | 7 (Redis) |
| **Torrent client** | qBittorrent | WebUI API |
| **Indexer** | Prowlarr / Jackett | latest |
| **Runtime** | Node.js | 22+ |
| **Infra** | Docker Compose | Colima on macOS |

---

## Project Structure

```
canto/
├── apps/
│   ├── web/                  # Next.js 15 — web application
│   ├── mobile/               # Expo SDK 54 — iOS + Android
│   └── worker/               # BullMQ consumer — background jobs
│
├── packages/
│   ├── api/                  # tRPC v11 router definitions (shared by web + mobile)
│   │   └── src/
│   │       ├── root.ts       # appRouter
│   │       ├── media.ts      # search, get, preview, addToLibrary
│   │       ├── library.ts    # list, stats, refreshAll
│   │       ├── torrent.ts    # search, download, list, cancel
│   │       ├── provider.ts   # regions, watchProviders, networks
│   │       └── auth.ts       # login, register, logout, me
│   │
│   ├── auth/                 # better-auth config (shared)
│   ├── db/                   # Drizzle schema + client + migrations
│   ├── providers/            # TMDB, AniList, TVDB — normalized output
│   ├── ui/                   # Shared React components (shadcn/ui)
│   └── validators/           # Shared Zod schemas
│
├── tooling/
│   ├── eslint/
│   ├── prettier/
│   ├── tailwind/
│   └── typescript/
│
├── docker-compose.yaml
├── turbo.json
├── package.json
├── CLAUDE.md                 # AI assistant guide
├── PLAN.md                   # This file
└── ARCHITECTURE.md           # Database schema + ERD
```

---

## Database Schema

All tables use **UUIDv7** primary keys (time-sortable, globally unique). PostgreSQL 18.

### `media` — Core entity

Movies and TV shows in a single table. An item exists here whether or not it's in the user's library.

```
media
├── id                    UUIDv7 PK
├── type                  'movie' | 'show'
├── external_id           int NOT NULL
├── provider              varchar NOT NULL  — 'tmdb' | 'anilist' | 'tvdb'
├── UNIQUE(external_id, provider)
│
│   ── Identity ──
├── title                 varchar NOT NULL
├── original_title        varchar
├── overview              text
├── tagline               varchar
│
│   ── Dates ──
├── release_date          date
├── year                  int
├── last_air_date         date
│
│   ── Classification ──
├── status                varchar         — 'Returning Series', 'Ended', 'Released', etc.
├── genres                jsonb           — ['Drama', 'Action']
├── content_rating        varchar         — 'TV-MA', 'PG-13'
├── original_language     varchar(10)
├── spoken_languages      jsonb
├── origin_country        jsonb
│
│   ── Metrics ──
├── vote_average          real
├── vote_count            int
├── popularity            real
├── runtime               int             — minutes
│
│   ── Images ──
├── poster_path           varchar
├── backdrop_path         varchar
├── logo_path             varchar
│
│   ── External IDs ──
├── imdb_id               varchar
│
│   ── TV-specific (NULL for movies) ──
├── number_of_seasons     int
├── number_of_episodes    int
├── in_production         boolean
├── networks              jsonb           — ['Netflix', 'HBO']
│
│   ── Movie-specific (NULL for shows) ──
├── budget                bigint
├── revenue               bigint
├── collection            jsonb
│
│   ── Production ──
├── production_companies  jsonb
├── production_countries  jsonb
│
│   ── Library state ──
├── in_library            boolean DEFAULT false
├── library_path          varchar
├── added_at              timestamptz
├── continuous_download   boolean DEFAULT false
│
│   ── Timestamps ──
├── metadata_updated_at   timestamptz
├── created_at            timestamptz DEFAULT now()
└── updated_at            timestamptz DEFAULT now()
```

### `season`

```
season
├── id            UUIDv7 PK
├── media_id      FK → media ON DELETE CASCADE
├── number        int NOT NULL
├── UNIQUE(media_id, number)
├── external_id   int
├── name          varchar
├── overview      text
├── air_date      date
├── poster_path   varchar
├── episode_count int
├── created_at, updated_at
```

### `episode`

```
episode
├── id            UUIDv7 PK
├── season_id     FK → season ON DELETE CASCADE
├── number        int NOT NULL
├── UNIQUE(season_id, number)
├── external_id   int
├── title         varchar
├── overview      text
├── air_date      date
├── runtime       int
├── still_path    varchar
├── vote_average  real
├── created_at, updated_at
```

### `torrent`

```
torrent
├── id            UUIDv7 PK
├── hash          varchar UNIQUE
├── title         varchar NOT NULL
├── status        'downloading' | 'finished' | 'error' | 'unknown'
├── quality       'uhd' | 'fullhd' | 'hd' | 'sd' | 'unknown'
├── imported      boolean DEFAULT false
├── usenet        boolean DEFAULT false
├── created_at, updated_at
```

### `media_file`

```
media_file
├── id            UUIDv7 PK
├── media_id      FK → media ON DELETE CASCADE
├── episode_id    FK → episode ON DELETE CASCADE  (NULL for movies)
├── torrent_id    FK → torrent ON DELETE SET NULL
├── file_path     varchar NOT NULL
├── quality       varchar
├── size_bytes    bigint
├── created_at, updated_at
```

### `extras_cache`

```
extras_cache
├── id            UUIDv7 PK
├── media_id      FK → media ON DELETE CASCADE (UNIQUE)
├── data          jsonb  — {credits, similar, recommendations, videos, watch_providers}
├── created_at, updated_at
```

### Auth tables

Managed by better-auth + Drizzle adapter: `user`, `session`, `account`, `verification`.

---

## Entity Relationships

```
user ──1:N──> session

media ──1:N──> season ──1:N──> episode
media ──1:N──> media_file <──N:1── torrent
media ──1:1──> extras_cache

episode ──1:N──> media_file (for show episodes)
media_file.episode_id = NULL (for movies)
```

**Cascade rules:**
- Deleting `media` → cascades to seasons, episodes, media_files, extras_cache
- Deleting `torrent` → sets `media_file.torrent_id` to NULL (soft unlink)
- Deleting `season` → cascades to episodes
- Deleting `episode` → cascades to media_files for that episode

---

## tRPC Routers

### `media`

| Procedure | Type | Description |
|-----------|------|-------------|
| `search` | query | Search TMDB/AniList. Light results, nothing saved. |
| `getById` | query | Get from our DB by UUID |
| `getByExternal` | query | Get or fetch+persist from provider |
| `getExtras` | query | Credits, similar, videos (from extras_cache or fetch) |
| `addToLibrary` | mutation | `UPDATE media SET in_library = true` |
| `removeFromLibrary` | mutation | `UPDATE media SET in_library = false` |
| `updateMetadata` | mutation | Re-fetch from provider, update DB |
| `delete` | mutation | Hard delete from DB |

### `library`

| Procedure | Type | Description |
|-----------|------|-------------|
| `list` | query | Paginated + filtered + sorted from DB |
| `stats` | query | Counts, storage, downloads |
| `refreshAll` | mutation | Batch metadata refresh |

**Library filters:** type, genre, status, year range, language, score, runtime, content_rating, network, provider, search text, downloaded (has files?)

### `torrent`

| Procedure | Type | Description |
|-----------|------|-------------|
| `search` | query | Search Prowlarr/Jackett for media |
| `download` | mutation | Send to qBittorrent |
| `list` | query | All active/completed torrents |
| `cancel` | mutation | Cancel download |
| `delete` | mutation | Remove torrent + optionally files |

### `provider`

| Procedure | Type | Description |
|-----------|------|-------------|
| `regions` | query | Watch regions from TMDB |
| `watchProviders` | query | Streaming services by region |
| `networks` | query | Search TV networks |
| `companies` | query | Search production companies |

### `auth`

| Procedure | Type | Description |
|-----------|------|-------------|
| `login` | mutation | Email + password |
| `register` | mutation | Create account |
| `logout` | mutation | End session |
| `me` | query | Current user |

---

## Provider Normalization

All providers implement one interface, output one type:

```typescript
interface MetadataProvider {
  name: 'tmdb' | 'anilist' | 'tvdb';
  getMetadata(externalId: number, type: MediaType): Promise<NormalizedMedia>;
  search(query: string, type: MediaType, opts?: SearchOpts): Promise<SearchResult[]>;
  getExtras(externalId: number, type: MediaType): Promise<MediaExtras>;
}
```

Provider-specific quirks (AniList puts all episodes in Season 1, TVDB has different ID schemes) are handled inside each provider. The service/router layer never sees provider differences.

---

## Data Flow

### Search → Preview → Library

```
1. Search "Daredevil"
   → media.search({ query, type: "show", provider: "tmdb" })
   → TMDB API call → light results (poster, title, year, score)
   → Nothing saved to DB

2. Click result (preview)
   → media.getByExternal({ provider: "tmdb", externalId: 202555, type: "show" })
   → Not in DB? Fetch FULL metadata from TMDB → normalize → INSERT media + seasons + episodes
   → Already in DB? Return from DB
   → Result: complete media object, all fields populated

3. Click "Add to Library"
   → media.addToLibrary({ id })
   → UPDATE media SET in_library = true, added_at = now()
   → Zero API calls. Instant.

4. Open detail page
   → media.getById({ id })
   → Everything from DB (backdrop, genres, score, runtime — all local)
   → media.getExtras({ id })
   → extras_cache fresh? Return cached.
   → Stale? Fetch credits/similar/videos from TMDB → cache → return
```

### Torrent Download → Import

```
1. Search torrents
   → torrent.search({ mediaId, seasonNumber? })
   → Prowlarr API → ranked results

2. Download
   → torrent.download({ mediaId, indexerResultId })
   → qBittorrent API → INSERT torrent record

3. Background job (every 2 min)
   → Check qBittorrent for finished downloads
   → Match files to media (SxxExx for shows, name for movies)
   → Organize on disk (rename, move to library path)
   → INSERT media_file records
   → UPDATE torrent SET imported = true
```

---

## Background Jobs (BullMQ)

| Job | Schedule | Description |
|-----|----------|-------------|
| `import-torrents` | Every 2 min | Scan qBittorrent, organize finished downloads |
| `refresh-metadata` | Weekly | Re-fetch metadata for library items |
| `cleanup-cache` | Daily | Remove stale extras_cache for non-library items |

---

## UI Design Principles

Learned from previous sessions — carry these into the React rewrite:

- **Theme**: Dark theme (Abyss) with light mode support. Theme-aware gradients, not forced dark.
- **Layout**: Netflix/Prime Video inspired. Spotlight hero, horizontal carousels, floating topbar.
- **Filter sidebar**: Inline with content, toggleable, collapsible sections with icons. Auto-apply on selection (no "Apply" button). Reset fixed at footer.
- **Filter pills**: `rounded-lg`, primary bg when active, border + muted text when inactive, transition on state change.
- **Cards**: Responsive grid, poster 2:3 aspect ratio, hover scale, type badge (TV/Movie).
- **Streaming services**: Grid of app-icon logos from TMDB watch providers.
- **Mobile**: Bottom tab navigation, search at top.
- **Typography**: Light weight for secondary text, heavier for titles.
- **Scrollbar**: Visible only on hover, thin, never shifts layout.
- **Loading**: Skeleton placeholders, fade-in for images.

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Init Turborepo from create-t3-turbo template
- [ ] Configure Docker Compose (PostgreSQL 18, Redis 7, qBittorrent, Prowlarr)
- [ ] Drizzle schema (all tables from this plan)
- [ ] Initial migration
- [ ] tRPC server with health check
- [ ] Verify web app + mobile app boot

### Phase 2: Provider Layer
- [ ] `NormalizedMedia` + `SearchResult` + `MediaExtras` types in `packages/providers`
- [ ] TMDB provider (getMetadata, search, getExtras — full implementation)
- [ ] AniList provider (shows only)
- [ ] Provider factory: `getProvider('tmdb') → TmdbProvider`
- [ ] Unit tests for normalization

### Phase 3: Core API
- [ ] `media` router: search, getByExternal, getById, addToLibrary, removeFromLibrary
- [ ] `library` router: list with all filters + pagination + sorting
- [ ] `provider` router: regions, watchProviders
- [ ] `extras_cache` integration in media.getExtras
- [ ] Zod validators in `packages/validators`

### Phase 4: Web App
- [ ] Layout: topbar, sidebar filter, theme toggle
- [ ] Discover page: spotlight hero, carousels
- [ ] Search page: search bar, type/provider toggle, infinite scroll
- [ ] Library page: grid + filter sidebar + pagination
- [ ] Media detail page: hero, seasons, cast, similar, streaming providers
- [ ] Settings page: watch region

### Phase 5: Torrent System
- [ ] qBittorrent API client in `packages/api` or service
- [ ] Prowlarr/Jackett indexer client
- [ ] `torrent` router: search, download, list
- [ ] File organizer service (rename, move, SxxExx matching)
- [ ] BullMQ worker in `apps/worker` with import-torrents job

### Phase 6: Mobile App
- [ ] Expo app with tRPC client connected to same API
- [ ] Tab navigation (Library, Search, Discover, Settings)
- [ ] Library screen with filters
- [ ] Search screen
- [ ] Media detail screen
- [ ] Push notifications for completed downloads

### Phase 7: Auth + Polish
- [ ] better-auth setup in `packages/auth`
- [ ] Login/register pages (web + mobile)
- [ ] Protected tRPC procedures
- [ ] Notification system
- [ ] Error boundaries + loading states
- [ ] PWA support for web

---

## Commit Rules

- Conventional commits in English: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Atomic commits — one logical change per commit
- No co-author tags
- No emojis

---

## Infrastructure

### Docker Compose (dev)

```yaml
services:
  postgres:   # PostgreSQL 18 on :5432
  redis:      # Redis 7 on :6379
  qbittorrent: # qBittorrent WebUI on :8080
  prowlarr:   # Prowlarr on :9696
```

### Colima (macOS Docker)

```bash
colima start --cpu 4 --memory 4
```

---

## Legacy

The original Python/FastAPI + SvelteKit codebase is preserved in `old/` for reference during migration. Key files to reference:

- `old/media_manager/metadataProvider/tmdb.py` — TMDB API integration patterns
- `old/media_manager/tv/service.py` — Torrent import + file organization logic
- `old/media_manager/movies/service.py` — Same patterns for movies
- `old/web/src/lib/components/` — UI components to port to React
- `old/web/src/routes/(app)/` — Page layouts and data loading patterns
