# Canto — Comprehensive Review Plan

## 1. Dead Code & Unused Imports

### Files to clean
- `packages/api/src/routers/media.ts` — `season` import may no longer be needed directly (verify if used outside persist-media)
- `apps/web/src/app/(app)/settings/page.tsx` — verify all lucide icons after recent cleanup
- `apps/web/src/app/globals.css` — `@keyframes spotlightFadeIn`/`spotlightFadeOut` — verify if used
- `packages/providers/src/types.ts` — check if all exported interfaces are consumed

### Patterns to grep
```bash
# Find unused exports
# Find unused tRPC procedures (defined but never called from frontend)
# Find unused CSS utilities/keyframes
```

---

## 2. Code Duplication

### High priority
- **persistMedia / updateMediaFromNormalized** — extracted to `packages/db/src/persist-media.ts` but the types are duplicated (NormalizedMedia interface defined locally instead of importing from `@canto/providers`). Should import `NormalizedMedia` directly.
- **Jellyfin/Plex credential fetching** — `getJellyfinCredentials()` in `jellyfin.ts`, similar pattern in `plex.ts`, and manual `getSetting` calls in `reverse-sync.ts`. Should have a shared `getServerCredentials(server)` helper.
- **SSH exec pattern** — `sshExec()` in `import-torrents.ts` is duplicated logic. Should be in a shared util.
- **Toast patterns** — save/test feedback in settings page repeats the same `onSuccess`/`onError` toast pattern 10+ times. Could be a `useMutationWithToast` hook.

### Medium priority
- **Media card rendering** — `media-card.tsx`, `featured-carousel.tsx`, and `spotlight` all render poster+title+year cards differently. Could share a base `MediaCardBase` component.
- **Provider search URL resolution** — `getProviderSearchUrl()` in media page could be a shared util since watch provider links are used in multiple contexts.
- **Filter bar pattern** — library, torrents, and browse pages all have similar sticky filter bars with tab bars + search. Could be a `FilterToolbar` component.

---

## 3. Backend Architecture

### Current structure
```
packages/api/src/routers/
├── auth.ts
├── jellyfin.ts
├── library.ts
├── media.ts        ← 600+ lines, does too much
├── plex.ts
├── provider.ts     ← 250+ lines, mixes TMDB proxy + watch providers + spotlight
├── settings.ts
├── sync.ts         ← 280+ lines, growing
└── torrent.ts      ← 1700+ lines, massive
```

### Proposed restructure

#### Split `media.ts`
- `media.queries.ts` — getById, getByExternal, search, discover
- `media.mutations.ts` — addToLibrary, removeFromLibrary, updateMetadata, delete
- `media.extras.ts` — getExtras, recommendations (heavy cached operations)

#### Split `torrent.ts` (1700 lines)
- `torrent.search.ts` — search across indexers (Prowlarr/Jackett)
- `torrent.download.ts` — add/remove/manage torrents in qBittorrent
- `torrent.import.ts` — auto-import logic, file organization
- `torrent.queries.ts` — list, listByMedia, stats

#### Split `provider.ts`
- `provider.tmdb.ts` — TMDB proxy calls (regions, watchProviders, networks, companies)
- `provider.spotlight.ts` — spotlight generation (heavy, should be cached)
- `provider.watch-links.ts` — watchProviderLinks DB query

#### Split `sync.ts`
- `sync.import.ts` — importMedia trigger + status
- `sync.items.ts` — listSyncedItems, resolveSyncItem, searchForSyncItem
- `sync.availability.ts` — mediaAvailability, mediaServers

#### Shared utilities to extract
```
packages/api/src/
├── lib/
│   ├── server-credentials.ts   ← getJellyfinCredentials, getPlexCredentials
│   ├── tmdb-client.ts          ← getTmdb() singleton
│   └── queue.ts                ← BullMQ queue factory
```

### Auth protection
5 mutations currently use `publicProcedure` with TODO comments:
- `media.addToLibrary`
- `media.removeFromLibrary`
- `media.updateMetadata`
- `media.delete`
- `torrent.search`

All should be `protectedProcedure`.

---

## 4. Frontend Architecture

### Components to extract

#### From `apps/web/src/app/(app)/media/[id]/page.tsx` (1400+ lines)
- `WhereToWatch` → `components/media/where-to-watch.tsx` (already a component, just move to own file)
- Torrent dialog section → `components/media/torrent-dialog.tsx`
- Torrent table → `components/media/torrent-table.tsx`
- The entire page should be ~200 lines max, composing these components

#### From `apps/web/src/app/(app)/settings/page.tsx` (1300+ lines)
- `SyncedItemsTable` → `components/settings/synced-items-table.tsx`
- `ServerLibraryGroup` → `components/settings/server-library-group.tsx`
- `ServiceRow` / `MediaServerRow` → `components/settings/service-row.tsx`
- `SettingsFields` → `components/settings/settings-fields.tsx`
- Each tab section → own file: `components/settings/services-section.tsx`, etc.

#### From `apps/web/src/components/media/season-tabs.tsx` (700+ lines)
- `EpisodeCard` → `components/media/episode-card.tsx`
- `SeasonBlock` → `components/media/season-block.tsx`
- Keep `SeasonTabs` as the orchestrator

### Shared hooks to create
- `useServerLinks(mediaId)` — combines mediaServers + mediaAvailability queries
- `useMutationWithToast(options)` — wraps tRPC mutation with toast feedback
- `usePollingQuery(queryFn, { interval, stopWhen })` — encapsulates the polling pattern used in sync

### State management
- Media page has 15+ `useState` calls. Consider grouping related state into a `useReducer` or extracting into custom hooks:
  - `useTorrentDialog()` — dialog open, search query, filters, sort, pagination
  - `useRemoveDialog()` — remove dialog state + options

---

## 5. Performance

### Endpoint caching
- **`provider.spotlight`** — makes 20+ TMDB API calls per page load. Should cache in DB with 1h TTL.
- **`media.recommendations`** — fetches extras for 3 random items. Add `staleTime: 5min` on frontend.
- **`media.discover`** — returns `SearchResult[]` which is already slim. No action needed.

### Frontend
- **`WhereToWatch`** re-renders unnecessarily — should be `memo`'d since props rarely change
- **`CastSection`** uses `useRef` + `scrollHeight` measurement — consider `ResizeObserver` for more reliable height detection
- **Settings page** — each tab mounts/unmounts completely. Consider `keepMounted` pattern for tabs with heavy state (Libraries with sync status).

### Database
- **`sync_episode`** table could grow large for big libraries. Add index on `(sync_item_id, season_number, episode_number)`.
- **`extras_cache`** — 7-day TTL. Consider cleaning stale entries for media no longer in library.

---

## 6. Type Safety

### Issues
- `preferences as Record<string, unknown>` cast in settings — should have a typed preferences schema
- `getSetting<string>("key")` returns `unknown` internally — type assertions everywhere. Consider typed settings keys.
- `NormalizedMedia` is duplicated in `persist-media.ts` instead of importing from `@canto/providers`
- Several `as` casts in TMDB provider for API responses — could use zod schemas for runtime validation

---

## 7. Testing (currently none)

### Priority test targets
1. `persistMedia()` — core data insertion, most critical
2. `normalizeWatchProviders()` — data transformation with edge cases
3. `handleReverseSync()` — complex flow with multiple API calls
4. `getProviderSearchUrl()` — URL template resolution
5. tRPC endpoint input validation — ensure zod schemas are correct

---

## 8. Quick Wins (can do now)

1. Remove `tab-gradient-active` CSS ✅ (done)
2. Remove unused icon imports ✅ (done)
3. Add `staleTime` to recommendations query on frontend
4. Move `WhereToWatch` to own file
5. Import `NormalizedMedia` type in persist-media instead of duplicating
6. Switch 5 mutations to `protectedProcedure`
7. Cache spotlight in DB
