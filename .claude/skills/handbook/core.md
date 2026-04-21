# Core — `packages/core`

Domain use-cases + infrastructure. Ports-and-adapters (hexagonal). This is where the business logic lives.

## Architectural rules

1. **No framework imports in `domain/`.** No `@trpc/server`, Next.js, Expo, React, `bullmq`, `ioredis`, `better-auth`. Transport concerns live in `packages/api`. Queue dispatch goes through `JobDispatcherPort`.
2. **No direct I/O in `domain/`.** No `fetch()`, no `node:fs`, no raw HTTP clients. Call an adapter via a port.
3. **Ports only when implemented + consumed via DI.** A port has ≥1 adapter binding AND ≥1 domain module consuming it via DI.
4. **Repositories are bare-function modules.** `findMediaById(db, id)` — `db: Database` is the DI boundary. No repo ports unless a second impl exists.
5. **Functional services, not classes.** Stateless services export functions. Classes are reserved for stateful infrastructure (queue workers, etc.); prefer factory closures even there.
6. **Use-cases receive deps via a `deps` object.** Pattern: `async function doX(input, deps: { tmdb: MediaProviderPort, dispatcher: JobDispatcherPort })`.
7. **Size budget**: `domain/` ≤ 300 LOC (target), ≤ 400 (hard). `infrastructure/` ≤ 400 (target), ≤ 500 (hard). Above hard cap, split by concern.
8. **No `any`.**
9. **Provider deps behind `MediaProviderPort`.** No direct `TmdbProvider` / `TvdbProvider` imports in `domain/` outside composition roots.
10. **Doc-strings match behavior.**
11. **Errors are specific `DomainError` subclasses.** Never generic throws. tRPC layer maps to `TRPCError` via middleware.

## Structure

```
packages/core/src/
├── index.ts                      # Re-exports ports, types, rules
├── domain/
│   ├── errors.ts                 # DomainError base + specific subclasses
│   ├── ports/                    # Adapter interfaces
│   │   ├── cache.ts
│   │   ├── download-client.ts
│   │   ├── indexer.ts
│   │   ├── job-dispatcher.port.ts
│   │   ├── media-provider.port.ts
│   │   └── media-server.port.ts
│   ├── rules/                    # Pure functions, no I/O
│   ├── services/                 # Stateless functional services
│   ├── types/                    # Shared domain types
│   ├── use-cases/                # Application orchestration
│   └── sync/                     # Phase-based orchestrations
├── infrastructure/
│   ├── adapters/                 # tmdb, tvdb, trakt, qbit, prowlarr, jackett, jellyfin, plex, filesystem
│   ├── cache/                    # CachePort impl (redis.ts)
│   ├── queue/                    # bullmq-dispatcher, queue-names, redis-config
│   └── repositories/             # Bare-fn modules: findX / insertY / updateZ(db, …)
└── lib/                          # server-credentials, log-error, tmdb-client, tvdb-client
```

## Use-case pattern

```ts
// domain/use-cases/fetch-media-metadata.ts
import type { Database } from "@canto/db";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { CachePort } from "../ports/cache";
import type { NormalizedMedia } from "@canto/providers";
import { MediaNotFoundError } from "../errors";

interface FetchMediaMetadataInput {
  externalId: string;
  provider: "tmdb" | "tvdb";
  type: "movie" | "show";
}

interface Deps {
  tmdb: MediaProviderPort;
  tvdb: MediaProviderPort;
  cache: CachePort;
}

export async function fetchMediaMetadata(
  db: Database,
  input: FetchMediaMetadataInput,
  deps: Deps,
): Promise<NormalizedMedia> {
  // 1. Normalize input (pure).
  // 2. Read from cache / repository.
  // 3. Call provider via port.
  // 4. Return normalized result.
}
```

Rules:
- Explicit input type + explicit return type.
- `deps` is always an object literal at the call site.
- `db: Database` as first param (ambient DI).
- Pure middle; side effects at edges.

## Repository pattern

```ts
// infrastructure/repositories/user-hidden-media-repository.ts
import type { Database } from "@canto/db";
import { userHiddenMedia } from "@canto/db/schema";
import { and, eq } from "drizzle-orm";

export function findHiddenIds(db: Database, userId: string): Promise<string[]> { /* … */ }
export function hideMedia(db: Database, userId: string, mediaId: string): Promise<void> { /* … */ }
export function unhideMedia(db: Database, userId: string, mediaId: string): Promise<void> { /* … */ }
```

Rules:
- Bare exported functions. No classes, no interfaces, no ports.
- `db: Database` first arg.
- One file per aggregate.
- If a file passes ~500 LOC, split into a subfolder with barrel: `user-media/{state,playback,history,feed,stats,insights}.ts` + `user-media/index.ts`.

## Service pattern

```ts
// domain/services/media-version-groups-service.ts
export function groupVersionsByResolution(
  versions: MediaVersion[],
): Map<string, MediaVersion[]> { /* … */ }
```

Rules:
- Exported functions only. Pure data-in → data-out. No I/O.

## Port pattern

```ts
// domain/ports/job-dispatcher.port.ts
export interface JobDispatcherPort {
  reconcileShow(mediaId: string): Promise<void>;
  refreshExtras(mediaId: string): Promise<void>;
  translateEpisodes(mediaId: string): Promise<void>;
  rebuildUserRecs(userId: string): Promise<void>;
  refreshAllLanguage(lang: string): Promise<void>;
  mediaPipeline(input: MediaPipelineJob): Promise<void>;
}
```

Adapter:

```ts
// infrastructure/queue/job-dispatcher.adapter.ts
import type { JobDispatcherPort } from "../../domain/ports/job-dispatcher.port";
import * as dispatcher from "./bullmq-dispatcher";

export const jobDispatcher: JobDispatcherPort = {
  reconcileShow: dispatcher.dispatchReconcileShow,
  refreshExtras: dispatcher.dispatchRefreshExtras,
  /* … */
};
```

Live adapter ports: `cache`, `download-client`, `indexer`, `job-dispatcher`, `media-provider`, `media-server`.

## Pipeline pattern

For multi-phase orchestrations (validate → dedupe → resolve → persist → reconcile), use a phase-sequenced module with pure stage functions. See `domain/sync/sync-pipeline.ts`.

One pipeline per domain concern. Don't mix watchlist + ratings + history in one pipeline file — split per concern.

## Errors

`domain/errors.ts` exports an abstract `DomainError` base with a `code` field, plus specific subclasses grouped by semantic meaning:

```ts
// NOT_FOUND
MediaNotFoundError
ListNotFoundError

// FORBIDDEN
ListPermissionError

// BAD_REQUEST
SystemListModificationError
InvalidPathError
InvalidDownloadInputError

// CONFLICT
BlocklistedReleaseError
DuplicateDownloadError

// INTERNAL
DownloadClientError
IndexerSearchError
TorrentPersistenceError
```

Throw the specific subclass at the throw site:

```ts
if (!media) throw new MediaNotFoundError(mediaId);
if (blocked) throw new BlocklistedReleaseError(blocked.reason);
if (!ctx.canEdit) throw new ListPermissionError("Insufficient list permissions");
```

Adding a new domain error: extend `DomainError`, pick a code, name it after the domain concept (`FolderRuleConflictError`, `PlexConnectionError`), export from `errors.ts`. The tRPC middleware in `packages/api/src/trpc.ts` automatically maps `DomainError` subclasses to `TRPCError` via the `code` field.

Fire-and-forget side effects use `logAndSwallow` from `@canto/core/lib/log-error`.

## Where things live

| Concern | Home |
|---|---|
| Input validation schema | `packages/validators` |
| External API call | `packages/core/infrastructure/adapters/<provider>.ts` |
| DB query | `packages/core/infrastructure/repositories/<aggregate>-repository.ts` |
| Queue dispatch | `packages/core/infrastructure/queue/bullmq-dispatcher.ts` via `JobDispatcherPort` |
| Business rule (pure) | `packages/core/domain/rules/<domain>.ts` |
| Orchestration | `packages/core/domain/use-cases/<action>.ts` |
| Persistence orchestration (write-side transaction) | `packages/core/domain/use-cases/persist-*.ts` |
| Provider normalization | `packages/providers` |
| Domain errors | `packages/core/src/domain/errors.ts` |

## Canonical files

- `domain/use-cases/fetch-media-metadata.ts` — DI template
- `domain/use-cases/persist-media.ts` — write-side transaction orchestrator
- `domain/sync/sync-pipeline.ts` — phase-based orchestration
- `infrastructure/queue/bullmq-dispatcher.ts` — `createQueueGetter` + `dispatchUniqueJob`
- `infrastructure/queue/redis-config.ts` — `getRedisConnection()` (single source)
- `infrastructure/queue/queue-names.ts` — `QUEUES` const
- `infrastructure/repositories/shared/recs-filter-builder.ts` — focused Drizzle builder
- `domain/services/media-version-groups-service.ts` — functional service
- `domain/errors.ts` — DomainError base + specific subclasses

## PR checklist — core

- [ ] `domain/` imports are pure — no `@trpc/server`, `bullmq`, `ioredis`, `node:fs*`, raw `fetch()`.
- [ ] New file within size budget; split by concern if over.
- [ ] No `any`.
- [ ] New port has ≥1 adapter AND ≥1 domain caller consuming via DI.
- [ ] New repository function: bare `export function`, first arg `db: Database`, re-exported from the aggregate barrel.
- [ ] New use-case: pure function, input + `deps` object, explicit return type.
- [ ] New error: extends a `DomainError` subclass, exported from `errors.ts`, named after the domain concept.
- [ ] Fire-and-forget error path uses `logAndSwallow`.
- [ ] HTTP calls live in `infrastructure/adapters/*`.
