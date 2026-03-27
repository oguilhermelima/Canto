# Canto — Architecture Plan

## Overview

Canto is a self-hosted media management application for movies and TV shows. It fetches metadata from external providers (TMDB, AniList, TVDB), manages a local library, and handles torrent-based downloads with automatic file organization.

**Stack**: T3 Turbo — Next.js (web) + Expo (mobile) + tRPC + Drizzle + PostgreSQL 18 + BullMQ

---

## Monorepo Structure

```
├── apps/
│   ├── web/                  # Next.js 15 (React 19, Tailwind v4, shadcn/ui)
│   ├── mobile/               # Expo SDK 54 (React Native 0.81, NativeWind v5)
│   └── worker/               # BullMQ job consumer (Node.js process)
│
├── packages/
│   ├── api/                  # tRPC v11 routers + procedures
│   │   ├── src/
│   │   │   ├── root.ts       # appRouter = mergeRouters(media, library, torrent, provider, auth)
│   │   │   ├── media.ts      # search, getById, getByExternal, getExtras, addToLibrary, etc.
│   │   │   ├── library.ts    # list (paginated + filtered), stats, refreshAll
│   │   │   ├── torrent.ts    # search, download, list, cancel, delete
│   │   │   ├── provider.ts   # regions, watchProviders, networks, companies
│   │   │   └── auth.ts       # login, register, logout, me
│   │   └── package.json
│   │
│   ├── auth/                 # better-auth config
│   │   ├── src/
│   │   │   ├── config.ts     # Auth configuration
│   │   │   └── client.ts     # Auth client for apps
│   │   └── package.json
│   │
│   ├── db/                   # Drizzle ORM
│   │   ├── src/
│   │   │   ├── schema.ts     # All tables — single source of truth
│   │   │   ├── client.ts     # Drizzle client instance
│   │   │   └── seed.ts       # Optional seed data
│   │   ├── drizzle/          # Generated migrations
│   │   └── package.json
│   │
│   ├── providers/            # Metadata provider abstraction
│   │   ├── src/
│   │   │   ├── types.ts      # NormalizedMedia, NormalizedSeason, SearchResult
│   │   │   ├── tmdb.ts       # TMDB API client + normalization
│   │   │   ├── anilist.ts    # AniList GraphQL client + normalization
│   │   │   ├── tvdb.ts       # TVDB API client + normalization
│   │   │   └── index.ts      # Factory: getProvider(name) → MetadataProvider
│   │   └── package.json
│   │
│   ├── ui/                   # Shared React components
│   │   ├── src/              # shadcn/ui components + custom components
│   │   └── package.json
│   │
│   └── validators/           # Shared Zod schemas
│       ├── src/
│       │   ├── media.ts      # Media input/filter schemas
│       │   ├── library.ts    # Library filter schemas
│       │   └── auth.ts       # Auth input schemas
│       └── package.json
│
├── tooling/
│   ├── eslint/
│   ├── prettier/
│   ├── tailwind/
│   └── typescript/
│
├── docker-compose.yaml       # PostgreSQL 18, Redis 7, qBittorrent, Prowlarr
├── turbo.json
└── package.json
```

---

## Database Schema

All tables use **UUIDv7** primary keys. PostgreSQL 18.

### `media` — Core entity (movies + shows unified)

```sql
CREATE TABLE media (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  type          VARCHAR NOT NULL CHECK (type IN ('movie', 'show')),
  external_id   INT NOT NULL,
  provider      VARCHAR NOT NULL,  -- 'tmdb', 'anilist', 'tvdb'
  UNIQUE(external_id, provider),

  -- Identity
  title             VARCHAR NOT NULL,
  original_title    VARCHAR,
  overview          TEXT,
  tagline           VARCHAR,

  -- Dates
  release_date      DATE,
  year              INT,
  last_air_date     DATE,

  -- Classification
  status            VARCHAR,        -- 'Returning Series', 'Ended', 'Released', etc.
  genres            JSONB,          -- ['Drama', 'Action']
  content_rating    VARCHAR,        -- 'TV-MA', 'PG-13'
  original_language VARCHAR(10),
  spoken_languages  JSONB,          -- ['en', 'pt']
  origin_country    JSONB,          -- ['US']

  -- Metrics
  vote_average      REAL,
  vote_count        INT,
  popularity        REAL,
  runtime           INT,            -- minutes (episode avg for shows)

  -- Images (TMDB paths)
  poster_path       VARCHAR,
  backdrop_path     VARCHAR,
  logo_path         VARCHAR,

  -- External IDs
  imdb_id           VARCHAR,

  -- TV-specific (NULL for movies)
  number_of_seasons   INT,
  number_of_episodes  INT,
  in_production       BOOLEAN,
  networks            JSONB,        -- ['Netflix', 'HBO']

  -- Movie-specific (NULL for shows)
  budget              BIGINT,
  revenue             BIGINT,
  collection          JSONB,        -- {id, name, poster_path}

  -- Production
  production_companies JSONB,       -- [{id, name, logo_path}]
  production_countries JSONB,       -- ['US', 'UK']

  -- Library state
  in_library          BOOLEAN DEFAULT FALSE,
  library_path        VARCHAR,
  added_at            TIMESTAMPTZ,
  continuous_download BOOLEAN DEFAULT FALSE,

  -- Timestamps
  metadata_updated_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_type ON media(type);
CREATE INDEX idx_media_in_library ON media(in_library) WHERE in_library = TRUE;
CREATE INDEX idx_media_provider ON media(provider, external_id);
CREATE INDEX idx_media_genres ON media USING GIN(genres);
```

### `season`

```sql
CREATE TABLE season (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  media_id      UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  number        INT NOT NULL,
  external_id   INT,
  name          VARCHAR,
  overview      TEXT,
  air_date      DATE,
  poster_path   VARCHAR,
  episode_count INT,
  UNIQUE(media_id, number),

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `episode`

```sql
CREATE TABLE episode (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  season_id     UUID NOT NULL REFERENCES season(id) ON DELETE CASCADE,
  number        INT NOT NULL,
  external_id   INT,
  title         VARCHAR,
  overview      TEXT,
  air_date      DATE,
  runtime       INT,
  still_path    VARCHAR,
  vote_average  REAL,
  UNIQUE(season_id, number),

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `torrent`

```sql
CREATE TABLE torrent (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  hash          VARCHAR UNIQUE,
  title         VARCHAR NOT NULL,
  status        VARCHAR DEFAULT 'unknown',  -- downloading, finished, error, unknown
  quality       VARCHAR DEFAULT 'unknown',  -- uhd, fullhd, hd, sd, unknown
  imported      BOOLEAN DEFAULT FALSE,
  usenet        BOOLEAN DEFAULT FALSE,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `media_file`

```sql
CREATE TABLE media_file (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  media_id      UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  episode_id    UUID REFERENCES episode(id) ON DELETE CASCADE,  -- NULL for movies
  torrent_id    UUID REFERENCES torrent(id) ON DELETE SET NULL,
  file_path     VARCHAR NOT NULL,
  quality       VARCHAR DEFAULT 'unknown',
  size_bytes    BIGINT,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_file_media ON media_file(media_id);
CREATE INDEX idx_media_file_torrent ON media_file(torrent_id);
```

### `extras_cache`

```sql
CREATE TABLE extras_cache (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  media_id      UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE UNIQUE,
  data          JSONB NOT NULL,  -- {credits, similar, recommendations, videos, watch_providers}

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Auth tables (managed by better-auth)

```sql
-- better-auth manages these tables automatically via Drizzle adapter:
-- user, session, account, verification
-- See: https://better-auth.com/docs/adapters/drizzle
```

---

## Entity Relationship Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│   user   │────>│ session  │     │ account  │
└──────────┘  1:N└──────────┘     └──────────┘

┌──────────────────────────────────────────────┐
│                   media                       │
│  type: 'movie' | 'show'                      │
│  in_library: boolean                          │
├──────────────────────────────────────────────┤
│                                               │
│  ┌─── 1:N ───> season ─── 1:N ───> episode   │  (shows only)
│  │                                            │
│  ├─── 1:N ───> media_file <─── N:1 ── torrent│
│  │              ↑                             │
│  │              └── episode_id (nullable)     │
│  │                                            │
│  └─── 1:1 ───> extras_cache                  │
│                                               │
└──────────────────────────────────────────────┘
```

**Key rules:**
- `media` is the central entity. Everything hangs off it.
- For **movies**: `media_file.episode_id` is NULL, file links directly to media.
- For **show episodes**: `media_file.episode_id` points to the specific episode.
- Deleting media **cascades** to seasons, episodes, files, and cache.
- Deleting a torrent **sets NULL** on `media_file.torrent_id` (soft unlink).
- `extras_cache` is 1:1 with media — one cache entry per media item.

---

## tRPC Router Design

### `media` router

```typescript
media.search        // Search TMDB/AniList (light results, nothing saved)
media.getById       // Get from our DB by UUID
media.getByExternal // Get or fetch+persist from provider
media.getExtras     // Credits, similar, videos (cached in extras_cache)
media.addToLibrary  // UPDATE media SET in_library = true
media.removeFromLibrary
media.updateMetadata // Re-fetch from provider, update DB
media.delete        // Hard delete from DB
```

### `library` router

```typescript
library.list        // Paginated, filtered, sorted (from our DB only)
                    // Filters: type, genre, status, year, language, score,
                    //          runtime, content_rating, network, provider,
                    //          search text, downloaded (has files?)
library.stats       // Counts, storage usage
library.refreshAll  // Batch metadata refresh for all library items
```

### `torrent` router

```typescript
torrent.search      // Search Prowlarr/Jackett for a media item
torrent.download    // Trigger download via qBittorrent
torrent.list        // All active/completed torrents
torrent.cancel      // Cancel download
torrent.delete      // Remove torrent + optionally files
```

### `provider` router

```typescript
provider.regions         // Watch regions from TMDB
provider.watchProviders  // Streaming services by region (with logos)
provider.networks        // Search TV networks
provider.companies       // Search production companies
```

---

## Provider Normalization Layer

Every provider outputs the same type:

```typescript
interface MetadataProvider {
  name: 'tmdb' | 'anilist' | 'tvdb';

  getMetadata(externalId: number, type: 'movie' | 'show'): Promise<NormalizedMedia>;
  search(query: string, type: 'movie' | 'show', opts?: SearchOpts): Promise<SearchResult[]>;
  getExtras(externalId: number, type: 'movie' | 'show'): Promise<MediaExtras>;
}

type NormalizedMedia = {
  externalId: number;
  provider: string;
  type: 'movie' | 'show';
  title: string;
  originalTitle?: string;
  overview: string;
  tagline?: string;
  releaseDate?: string;
  year?: number;
  status?: string;
  genres: string[];
  contentRating?: string;
  originalLanguage?: string;
  voteAverage?: number;
  voteCount?: number;
  runtime?: number;
  posterPath?: string;
  backdropPath?: string;
  imdbId?: string;
  // TV
  seasons?: NormalizedSeason[];
  networks?: string[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  // Movie
  budget?: number;
  revenue?: number;
  // Shared
  productionCompanies?: { id: number; name: string; logoPath?: string }[];
};

type MediaExtras = {
  credits: { cast: CastMember[]; crew: CrewMember[] };
  similar: SearchResult[];
  recommendations: SearchResult[];
  videos: Video[];
  watchProviders?: WatchProvidersByRegion;
};
```

---

## Background Jobs (BullMQ + Redis)

```
apps/worker/ — standalone Node.js process

Queues:
├── import-torrents     (every 2 min)   — Scan qBittorrent for completed downloads,
│                                         match to media, organize files on disk
├── refresh-metadata    (weekly)        — Re-fetch metadata for in_library items
│                                         from their original provider
└── cleanup-cache       (daily)         — Remove extras_cache entries older than 30d
                                          for items not in library
```

---

## Data Flow

### Search → Preview → Add to Library

```
1. User searches "Daredevil"
   → tRPC: media.search({ query: "Daredevil", type: "show", provider: "tmdb" })
   → TMDB /search/tv API call
   → Returns light results (poster, title, year, score) — nothing saved

2. User clicks a result to preview
   → tRPC: media.getByExternal({ provider: "tmdb", externalId: 202555, type: "show" })
   → Check DB: exists? Return it.
   → Not in DB: Fetch FULL metadata from TMDB, normalize, INSERT into media + seasons + episodes
   → Return complete media object from our DB

3. User clicks "Add to Library"
   → tRPC: media.addToLibrary({ id: "uuid..." })
   → UPDATE media SET in_library = true, added_at = now()
   → Zero API calls, instant

4. User opens detail page
   → tRPC: media.getById({ id: "uuid..." })
   → All core data from DB (backdrop, genres, score, runtime — all local)
   → tRPC: media.getExtras({ id: "uuid..." })
   → Check extras_cache: fresh? Return it.
   → Stale/missing: Fetch credits, similar, videos from TMDB, cache, return
```

### Torrent Download → Import

```
1. User searches torrents for a media item
   → tRPC: torrent.search({ mediaId: "uuid...", seasonNumber?: 1 })
   → Prowlarr/Jackett API call
   → Returns ranked results

2. User picks a torrent
   → tRPC: torrent.download({ mediaId: "uuid...", indexerResultId: "..." })
   → Send to qBittorrent API
   → INSERT torrent record

3. Background job (every 2 min)
   → import-torrents job checks qBittorrent for finished downloads
   → Match files to media (SxxExx pattern for shows, name match for movies)
   → Organize files on disk (rename, move to library path)
   → INSERT media_file records
   → UPDATE torrent SET imported = true
```

---

## Migration from Legacy

### Phase 1: Project Setup
- [ ] Init Turborepo with T3 Turbo template
- [ ] Configure PostgreSQL 18 + Redis in Docker Compose
- [ ] Drizzle schema with all tables
- [ ] Initial migration
- [ ] tRPC server skeleton with health check

### Phase 2: Provider Layer
- [ ] `NormalizedMedia` type definition
- [ ] TMDB provider (full metadata + search + extras)
- [ ] AniList provider (shows only)
- [ ] Provider factory

### Phase 3: Core tRPC Routers
- [ ] `media` router (search, getById, getByExternal, addToLibrary)
- [ ] `library` router (list with all filters + pagination)
- [ ] `provider` router (regions, watch providers)

### Phase 4: Web App (Next.js)
- [ ] Layout (topbar, sidebar, theme)
- [ ] Library page with filter sidebar
- [ ] Search/Discover page
- [ ] Media detail page (hero, seasons, cast, similar)

### Phase 5: Torrent System
- [ ] qBittorrent API client
- [ ] Prowlarr/Jackett integration
- [ ] `torrent` router
- [ ] File organizer service
- [ ] BullMQ import job

### Phase 6: Mobile App (Expo)
- [ ] Expo app with tRPC client
- [ ] Library screen
- [ ] Search screen
- [ ] Media detail screen

### Phase 7: Auth + Polish
- [ ] better-auth setup (shared package)
- [ ] Protected routes (web + mobile)
- [ ] Settings page
- [ ] Notifications

### Data Migration Script
```
1. Map old show/movie UUIDs → new UUIDv7s
2. Merge show + movie rows into unified media table
3. Remap season.show_id → season.media_id
4. Merge episode_file + movie_file → media_file
5. Remap torrent associations
6. Re-fetch metadata for all items to populate new fields
```
