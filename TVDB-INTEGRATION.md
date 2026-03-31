# TVDB Integration — Design Document

## Core Principle

**TMDB is the base of everything.** Every item in the system must have a `tmdb_id`. Recommendations, similar, spotlight, credits, videos, watch providers — always built from the TMDB API.

**TVDB is an overlay for TV shows.** When the toggle is active, shows are replaced with TVDB data (metadata, seasons, episodes). Fields that TVDB doesn't have (ratings, popularity, trailers, logos) are preserved from TMDB.

---

## Architecture

### Data Flow

```
1. All discovery (trending, discover, spotlight, recommendations)
   → Always TMDB

2. Search
   Toggle OFF → TMDB movies + TMDB shows
   Toggle ON  → TMDB movies + TVDB shows

3. Persist on visit
   → Always persist from TMDB first
   → If show + toggle ON → background job replaces with TVDB

4. Recommendation pool refresh (refresh-extras job)
   → Fetch extras from TMDB (credits, similar, recommendations, videos, watch providers)
   → Save pool items from TMDB
   → If toggle ON → second pass: replace show items in pool with TVDB data
     - Batch of 20 replacements/second
     - Process from first items onward
     - Replace: title, overview, posterPath, backdropPath
     - Keep from TMDB: voteAverage, voteCount, popularity, score, trailerKey, logoPath
     - Update pool row provider from "tmdb" → "tvdb"

5. Media show replacement (when toggle ON)
   → Find TVDB equivalent via IMDB cross-reference (TMDB provides tvdb_id in external_ids)
   → Replace on media row: title, overview, seasons/episodes, status, genres, images
   → Keep from TMDB: voteAverage, voteCount, popularity, score
```

### Search Behavior (toggle ON)

```
User searches "Bleach" with toggle ON:
  → TMDB search(query="Bleach", type="movie") → movie results
  → TVDB search(query="Bleach", type="show")  → show results (including TYBW as separate series)
  → Merge both result sets
  → Show results don't have ratings (TVDB limitation) — ratings appear after persist
```

### Ratings Strategy

TVDB does not provide voteAverage/voteCount/popularity.

- **On search**: show results from TVDB display without rating (acceptable — user searches by name)
- **On persist**: TMDB data is saved first (with ratings), then TVDB replaces metadata but keeps TMDB ratings
- **On pool items**: TMDB ratings are preserved when TVDB replaces show items

---

## Genre / Category System

### Local genre table

```sql
genre (
  id          serial primary key,
  name        varchar(100) not null,  -- our unified genre name
  tmdb_query  varchar(200),           -- exact query params for TMDB (e.g. "with_genres=16&with_original_language=ja")
  tvdb_query  varchar(200)            -- exact query params for TVDB (e.g. "genre=4")
)
```

### How it works

- Genres are stored locally with mappings to both providers
- When filtering by genre in discover/search:
  - If provider=all: query both TMDB and TVDB with their respective query params, merge + dedup
  - If provider=tmdb: use tmdb_query only
  - If provider=tvdb: use tvdb_query only
- Genres that exist only in one provider (e.g. TVDB "Anime", "Martial Arts", "Horror" for TV) only return results from that provider
- Genres in common (Comedy, Drama, etc.) return from both with dedup by IMDB ID

### Example mappings

| name | tmdb_query | tvdb_query |
|------|-----------|-----------|
| Action | with_genres=10759 | genre=1 |
| Adventure | with_genres=10759 | genre=2 |
| Animation | with_genres=16 | genre=3 |
| Anime | with_genres=16&with_original_language=ja | genre=4 |
| Comedy | with_genres=35 | genre=7 |
| Crime | with_genres=80 | genre=8 |
| Documentary | with_genres=99 | genre=9 |
| Drama | with_genres=18 | genre=10 |
| Fantasy | with_genres=10765 | genre=12 |
| Horror | (none for TV) | genre=26 |
| Kids | with_genres=10762 | genre=5 |
| Mystery | with_genres=9648 | genre=23 |
| Romance | (none for TV) | genre=28 |
| Sci-Fi | with_genres=10765 | genre=29 |
| Thriller | (none for TV) | genre=31 |
| Western | with_genres=37 | genre=35 |

---

## What exists already (implemented)

- TvdbProvider class with search, getMetadata, JWT auth
- tvdb-client.ts helper with token caching
- Settings: TVDB API key, token, toggle
- Settings UI: TVDB section with API key + test
- replaceMediaProvider use case + endpoint
- "Replace with TVDB/TMDB" button on media detail
- Schema: recommendation_pool uses externalId + provider (migrated from tmdbId)
- Schema: episode.absoluteNumber, episode.finaleType, season.seasonType
- Schema: media.tvdbId cross-reference
- Image URL handling (absolute TVDB URLs vs relative TMDB paths)
- English translations for TVDB series + seasons + episodes
- refresh-extras resolves TMDB ID for non-TMDB media via IMDB cross-ref

## What needs to be built

### Phase 1 — Dual search
- [ ] When toggle ON: browse endpoint searches TMDB(type=movie) + TVDB(type=show) in parallel
- [ ] Merge results into single response, tag each with provider
- [ ] Frontend renders both seamlessly

### Phase 2 — Auto-replace shows on persist
- [ ] After persistMedia for a show, if toggle ON, dispatch background job
- [ ] Job finds TVDB equivalent via IMDB ID (from TMDB external_ids.tvdb_id)
- [ ] Replaces metadata + seasons/episodes with TVDB data
- [ ] Preserves TMDB ratings, popularity, score

### Phase 3 — Pool show replacement
- [ ] After refresh-extras saves pool items from TMDB
- [ ] If toggle ON, second pass on pool items where mediaType=show
- [ ] Batch 20/s: fetch TVDB equivalent, replace title/overview/poster/backdrop
- [ ] Keep TMDB: voteAverage, voteCount, popularity, score, trailerKey, logoPath

### Phase 4 — Genre table + filtering
- [ ] Create genre table with tmdb_query + tvdb_query columns
- [ ] Seed with genre mappings
- [ ] Endpoint: provider.genres returns unified genre list
- [ ] Discover/browse filter accepts genreId (our internal ID)
- [ ] Backend resolves which provider query to use based on provider selection
- [ ] Merge + dedup results from both providers

### Phase 5 — TMDB external_ids extraction
- [ ] When TMDB getMetadata fetches a show, extract tvdb_id from external_ids
- [ ] Store as media.tvdbId automatically
- [ ] This enables auto-replace without title search fallback
