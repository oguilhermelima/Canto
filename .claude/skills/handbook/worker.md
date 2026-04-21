# Worker — `apps/worker`

BullMQ + Redis background process. The worker is **wiring only** — queues, schedulers, worker instances, and one-liner handlers that delegate to core use-cases.

## Architectural rules

1. **Handlers are ≤10 LOC.** Anything more is a use-case in `packages/core`. The worker does not own business logic.
2. **No DB queries in handlers.** Go through a repository in `@canto/core/infrastructure/repositories/*`.
3. **No `new TmdbProvider()` / `new TvdbProvider()` in handlers.** Use the cached `getTmdbProvider()` / `getTvdbProvider()` from `@canto/core/lib/*`.
4. **Static imports only.** No `await import(...)` in a handler or the boot file.
5. **Redis config is single-source.** `getRedisConnection()` in `@canto/core/infrastructure/queue/redis-config.ts` is read by producers and consumers alike.
6. **Queue names are constants.** Import `QUEUES.*` from `@canto/core/infrastructure/queue/queue-names.ts`.
7. **Every job declares `attempts` + `backoff`.** Default: `attempts: 3`, `backoff: { type: "exponential", delay: 10_000 }`. Override per-job with a comment explaining why.
8. **Every job declares `removeOnComplete` + `removeOnFail`.** Default: `50` / `50`. Document per-job overrides.
9. **One logger factory.** `createJobLogger(queueName)` returns a logger pre-tagged with `{ queue, jobId }`. No hand-prepended `[queue]` strings.
10. **Error handling**: throw on retryable failures (BullMQ retries). Catch + log + continue only inside a per-item loop so one bad item doesn't stall the run.
11. **Worker-level `failed` handler logs once, or not at all if handlers log.** No double-logging.
12. **One name per concept** across queue, dispatcher function, and use-case.

## Target layout

```
apps/worker/src/
├─ index.ts                    # probe, schedules, workers, shutdown (≤60 LOC)
├─ queues.ts                   # Queue declarations
├─ schedules.ts                # upsertJobScheduler calls
├─ workers/
│  ├─ scheduled.ts             # Cron worker factories
│  └─ on-demand.ts             # On-demand worker factories
└─ lib/
   ├─ job-logger.ts            # createJobLogger(queueName)
   └─ worker-factory.ts        # makeWorker(name, handler, opts)
```

## Canonical handler

```ts
// apps/worker/src/workers/on-demand.ts
import { QUEUES } from "@canto/core/infrastructure/queue/queue-names";
import { refreshExtras } from "@canto/core/domain/use-cases/refresh-extras";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { db } from "@canto/db/client";
import { makeWorker } from "../lib/worker-factory";

export const refreshExtrasWorker = makeWorker(
  QUEUES.refreshExtras,
  async ({ mediaId }: { mediaId: string }, log) => {
    const tmdb = await getTmdbProvider();
    await refreshExtras(db, mediaId, { tmdb });
    log.info({ mediaId }, "refreshed");
  },
  { concurrency: 2 },
);
```

`makeWorker` owns:
- Build `Worker` with shared `redisConnection`.
- Inject `log` tagged `{ queue, jobId }`.
- Attach `failed` / `error` listeners once.
- Default `attempts: 3`, `backoff: exponential`, `removeOnFail: 50`, `removeOnComplete: 50`.

## Canonical entry point

```ts
// apps/worker/src/index.ts
import { probeRedis } from "./bootstrap/probe";
import { registerSchedules } from "./schedules";
import { startWorkers } from "./workers";
import { closeAll } from "./bootstrap/shutdown";

async function main() {
  await probeRedis();
  await registerSchedules();
  const workers = startWorkers();
  process.on("SIGTERM", () => closeAll(workers));
  process.on("SIGINT",  () => closeAll(workers));
  console.log("Workers started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
```

A new engineer answers "what handles queue X?" with one grep against `QUEUES`.

## Queue catalog

Canonical list in `@canto/core/infrastructure/queue/queue-names.ts`:

```ts
export const QUEUES = {
  importTorrents: "import-torrents",
  jellyfinSync: "jellyfin-sync",
  plexSync: "plex-sync",
  reverseSyncFull: "reverse-sync-full",
  reverseSyncUser: "reverse-sync-user",
  traktSync: "trakt-sync",
  traktSyncUser: "trakt-sync-user",
  stallDetection: "stall-detection",
  rssSync: "rss-sync",
  dailyRecsCheck: "daily-recs-check",
  backfillExtras: "backfill-extras",
  seedManagement: "seed-management",
  folderScan: "folder-scan",
  validateDownloads: "validate-downloads",
  refreshExtras: "refresh-extras",
  reconcileShow: "reconcile-show",
  rebuildUserRecs: "rebuild-user-recs",
  refreshAllLanguage: "refresh-all-language",
  translateEpisodes: "translate-episodes",
  mediaPipeline: "media-pipeline",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
```

Adding a new queue: add an entry, use `QUEUES.yourName` in the scheduler/dispatcher/worker. One name per concept across all three.

## Error / retry rules

- **Retryable failures**: throw. Provider 5xx, Redis timeout, qBittorrent unreachable during a required action. BullMQ's `attempts + backoff` handles retry.
- **Per-item loop failures**: catch + log + continue. One bad item should not stall a reverse-sync over 200 users. Use `logAndSwallow(context)` for fire-and-forget side effects.
- Handlers do not call `console.error` directly — go through the injected logger.

## Logging conventions

- One logger per job, injected into the handler, tagged `{ queue, jobId }`.
- Structured fields: `queue`, `jobId`, `durationMs`, `outcome ∈ {ok, skip, fail}`, plus job-specific (`mediaId`, `userId`, `count`, `imported`, `stalled`, `retried`, …).
- No `[queue]` prefix strings — the logger adds them.
- Prefer counters over per-item logs: `log.info({ imported: 3, skipped: 5, failed: 0 }, "done")` beats 8 per-item lines.

## Repository pattern for inline queries

Query logic in a handler gets a repo function:

```ts
// BEFORE — query inline in a handler
const rows = await db.select(/* … */).from(media).where(/* … */);

// AFTER — repository function
import { findMonitoredShowsForRss } from "@canto/core/infrastructure/repositories/media-repository";
const rows = await findMonitoredShowsForRss(db);
```

## Testing approach

- Handlers are one-liners — test the **use-case in `packages/core/src/domain/use-cases/__tests__/*.test.ts`**, not `apps/worker`.
- If `makeWorker`'s retry/backoff behavior itself needs testing, stub the use-case and test the factory in isolation — don't start Redis.
- The worker app's own unit-test surface stays tiny: queue-name enumeration, schedule table, bootstrap probe.

## PR checklist — worker

- [ ] Handler body ≤10 LOC?
- [ ] All DB access goes through a repository from `@canto/core`?
- [ ] No `new SomeProvider(...)` — using cached `getXProvider()`?
- [ ] Queue name comes from `QUEUES.*`, not a string literal?
- [ ] `attempts` + `backoff` set?
- [ ] `removeOnComplete` + `removeOnFail` set consistently?
- [ ] Logger injected via factory; no `console.log("[queue] …")` prefix?
- [ ] New concept has one name across queue / dispatcher fn / use-case?
- [ ] No `await import(...)` — all static?
- [ ] Tests live in `packages/core/src/domain/use-cases/__tests__/*`, not in `apps/worker`?
