import { Queue } from "bullmq";

import { handleBackfillAspectState } from "./jobs/backfill-aspect-state";
import { handleBackfillUserRecDenorm } from "./jobs/backfill-user-rec-denorm";
import { handleImportTorrents } from "./jobs/import-torrents";
import {
  handleJellyfinSync,
  handlePlexSync,
  handleReverseSyncFull,
  handleReverseSyncUser,
} from "./jobs/reverse-sync";
import { handleStallDetection } from "./jobs/stall-detection";
import { handleRssSync } from "./jobs/rss-sync";
import { handleMediaCadenceSweep } from "./jobs/media-cadence-sweep";
import { handleSeedManagement } from "./jobs/seed-management";
import { handleFolderScan } from "./jobs/folder-scan";
import { handleValidateDownloads } from "./jobs/validate-downloads";
import { handleRepackSupersede } from "./jobs/repack-supersede";
import {
  handleTraktSync,
  handleTraktSyncUser,
  handleTraktSyncSection,
} from "./jobs/trakt-sync";
import type { RunSectionInput } from "@canto/core/domain/trakt/run-section";
import { handleTraktListDelete, handleTraktListDeleteSweep } from "./jobs/trakt-list-delete";
import { refreshExtras } from "@canto/core/domain/content-enrichment/use-cases/refresh-extras";
import { rebuildUserRecs } from "@canto/core/domain/recommendations/use-cases/rebuild-user-recs";
import { translateEpisodes } from "@canto/core/domain/content-enrichment/use-cases/translate-episodes";
import { enqueueDailyRecsRebuild } from "@canto/core/domain/recommendations/use-cases/enqueue-daily-recs-rebuild";
import { ensureMedia } from "@canto/core/domain/media/use-cases/ensure-media";
import type { EnsureMediaJob } from "@canto/core/platform/queue/bullmq-dispatcher";
import { QUEUES } from "@canto/core/platform/queue/queue-names";
import { getRedisConnection } from "@canto/core/platform/queue/redis-config";
import { db } from "@canto/db/client";
import { seedDownloadDefaults, seedLanguages } from "@canto/db";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";

import { DEFAULT_JOB_OPTS, makeWorker } from "./lib/worker-factory";

/* -------------------------------------------------------------------------- */
/*  Queues                                                                    */
/* -------------------------------------------------------------------------- */

const redisConnection = getRedisConnection();

const queues = {
  importTorrents: new Queue(QUEUES.importTorrents, { connection: redisConnection }),
  jellyfinSync: new Queue(QUEUES.jellyfinSync, { connection: redisConnection }),
  plexSync: new Queue(QUEUES.plexSync, { connection: redisConnection }),
  reverseSyncFull: new Queue(QUEUES.reverseSyncFull, { connection: redisConnection }),
  reverseSyncUser: new Queue(QUEUES.reverseSyncUser, { connection: redisConnection }),
  traktSync: new Queue(QUEUES.traktSync, { connection: redisConnection }),
  traktSyncUser: new Queue(QUEUES.traktSyncUser, { connection: redisConnection }),
  traktSyncSection: new Queue(QUEUES.traktSyncSection, { connection: redisConnection }),
  traktListDelete: new Queue(QUEUES.traktListDelete, { connection: redisConnection }),
  traktListDeleteSweep: new Queue(QUEUES.traktListDeleteSweep, { connection: redisConnection }),
  stallDetection: new Queue(QUEUES.stallDetection, { connection: redisConnection }),
  rssSync: new Queue(QUEUES.rssSync, { connection: redisConnection }),
  dailyRecsCheck: new Queue(QUEUES.dailyRecsCheck, { connection: redisConnection }),
  mediaCadenceSweep: new Queue(QUEUES.mediaCadenceSweep, { connection: redisConnection }),
  seedManagement: new Queue(QUEUES.seedManagement, { connection: redisConnection }),
  folderScan: new Queue(QUEUES.folderScan, { connection: redisConnection }),
  validateDownloads: new Queue(QUEUES.validateDownloads, { connection: redisConnection }),
  repackSupersede: new Queue(QUEUES.repackSupersede, { connection: redisConnection }),
};

/* -------------------------------------------------------------------------- */
/*  Schedules                                                                 */
/* -------------------------------------------------------------------------- */

// Spread reverse-sync cron fires by a random phase offset so multiple Canto
// instances (or coincident minute boundaries) don't herd on the same instant.
function jitterStart(maxMs: number): Date {
  return new Date(Date.now() + Math.floor(Math.random() * maxMs));
}

async function setupSchedules(): Promise<void> {
  await queues.importTorrents.upsertJobScheduler(
    "import-torrents-scheduler",
    { every: 2 * 60 * 1000 },
    { name: QUEUES.importTorrents, opts: DEFAULT_JOB_OPTS },
  );

  await queues.jellyfinSync.upsertJobScheduler(
    "jellyfin-sync-scheduler",
    { every: 5 * 60 * 1000, startDate: jitterStart(60 * 1000) },
    { name: QUEUES.jellyfinSync, opts: DEFAULT_JOB_OPTS },
  );

  await queues.plexSync.upsertJobScheduler(
    "plex-sync-scheduler",
    { every: 5 * 60 * 1000, startDate: jitterStart(60 * 1000) },
    { name: QUEUES.plexSync, opts: DEFAULT_JOB_OPTS },
  );

  // Daily full scan — ignores per-link delta checkpoints so deletion
  // detection (prune of stale media_version / user_media_library rows) still
  // runs at least once every 24h. The 5-min jellyfin/plex jobs only do
  // delta scans and cannot detect items removed on the server.
  await queues.reverseSyncFull.upsertJobScheduler(
    "reverse-sync-full-scheduler",
    { every: 24 * 60 * 60 * 1000, startDate: jitterStart(10 * 60 * 1000) },
    { name: QUEUES.reverseSyncFull, opts: DEFAULT_JOB_OPTS },
  );

  await queues.traktSync.upsertJobScheduler(
    "trakt-sync-scheduler",
    { every: 10 * 60 * 1000, startDate: jitterStart(2 * 60 * 1000) },
    { name: QUEUES.traktSync, opts: DEFAULT_JOB_OPTS },
  );

  // Sweeper for tombstoned Trakt-linked lists. Re-dispatches per-list deletion
  // jobs whose retry chain exhausted (Trakt down, refresh-token failure, etc.).
  await queues.traktListDeleteSweep.upsertJobScheduler(
    "trakt-list-delete-sweep-scheduler",
    { every: 5 * 60 * 1000, startDate: jitterStart(60 * 1000) },
    { name: QUEUES.traktListDeleteSweep, opts: DEFAULT_JOB_OPTS },
  );

  await queues.stallDetection.upsertJobScheduler(
    "stall-detection-scheduler",
    { every: 30 * 60 * 1000 },
    { name: QUEUES.stallDetection, opts: DEFAULT_JOB_OPTS },
  );

  await queues.rssSync.upsertJobScheduler(
    "rss-sync-scheduler",
    { every: 15 * 60 * 1000 },
    { name: QUEUES.rssSync, opts: DEFAULT_JOB_OPTS },
  );

  await queues.dailyRecsCheck.upsertJobScheduler(
    "daily-recs-check-scheduler",
    { every: 60 * 60 * 1000 },
    { name: QUEUES.dailyRecsCheck, opts: DEFAULT_JOB_OPTS },
  );

  // Daily aspect-state sweep — fans out ensureMedia for any media whose
  // media_aspect_state row is due (next_eligible_at <= now). The cadence
  // engine decides which aspects to refresh; this sweep just guarantees
  // due media gets picked up regardless of user activity. Jittered like
  // reverse-sync-full so multiple instances don't herd on midnight.
  await queues.mediaCadenceSweep.upsertJobScheduler(
    "media-cadence-sweep-scheduler",
    { every: 24 * 60 * 60 * 1000, startDate: jitterStart(10 * 60 * 1000) },
    { name: QUEUES.mediaCadenceSweep, opts: DEFAULT_JOB_OPTS },
  );

  await queues.seedManagement.upsertJobScheduler(
    "seed-management-scheduler",
    { every: 15 * 60 * 1000 },
    { name: QUEUES.seedManagement, opts: DEFAULT_JOB_OPTS },
  );

  await queues.folderScan.upsertJobScheduler(
    "folder-scan-scheduler",
    { every: 30 * 60 * 1000 },
    { name: QUEUES.folderScan, opts: DEFAULT_JOB_OPTS },
  );

  await queues.validateDownloads.upsertJobScheduler(
    "validate-downloads-scheduler",
    { every: 6 * 60 * 60 * 1000 },
    { name: QUEUES.validateDownloads, opts: DEFAULT_JOB_OPTS },
  );

  // Repack auto-supersede — every 6h. Lookback in the job is 14 days
  // so anything older than that is skipped without indexer cost.
  await queues.repackSupersede.upsertJobScheduler(
    "repack-supersede-scheduler",
    { every: 6 * 60 * 60 * 1000, startDate: jitterStart(10 * 60 * 1000) },
    { name: QUEUES.repackSupersede, opts: DEFAULT_JOB_OPTS },
  );
}

/* -------------------------------------------------------------------------- */
/*  Workers                                                                   */
/* -------------------------------------------------------------------------- */

const workers = [
  // ── Scheduled (cron) ──

  makeWorker(QUEUES.importTorrents, () => handleImportTorrents()),

  makeWorker(QUEUES.jellyfinSync, () => handleJellyfinSync()),

  makeWorker(QUEUES.plexSync, () => handlePlexSync()),

  makeWorker(QUEUES.reverseSyncFull, () => handleReverseSyncFull()),

  makeWorker<{ userId: string }>(
    QUEUES.reverseSyncUser,
    async ({ userId }, log) => {
      if (!userId) {
        log.warn("missing userId, skipping");
        return;
      }
      await handleReverseSyncUser(userId);
    },
    { concurrency: 2 },
  ),

  makeWorker(QUEUES.traktSync, () => handleTraktSync()),

  makeWorker<{ userId: string }>(
    QUEUES.traktSyncUser,
    async ({ userId }, log) => {
      if (!userId) {
        log.warn("missing userId, skipping");
        return;
      }
      await handleTraktSyncUser(userId);
    },
    { concurrency: 2 },
  ),

  // Per-section worker. Concurrency sits at 4 so a heavy backfill (eight
  // sections × multiple connections) doesn't bottleneck on one slot, while
  // still leaving headroom for the rest of the worker pool.
  makeWorker<RunSectionInput>(
    QUEUES.traktSyncSection,
    async (input, log) => {
      if (!input?.connectionId || !input?.section) {
        log.warn("missing connectionId/section, skipping");
        return;
      }
      await handleTraktSyncSection(input);
    },
    { concurrency: 4 },
  ),

  makeWorker<{ localListId: string }>(
    QUEUES.traktListDelete,
    async ({ localListId }, log) => {
      if (!localListId) {
        log.warn("missing localListId, skipping");
        return;
      }
      await handleTraktListDelete(localListId);
    },
    { concurrency: 2 },
  ),

  makeWorker(QUEUES.traktListDeleteSweep, () => handleTraktListDeleteSweep()),

  makeWorker(QUEUES.stallDetection, () => handleStallDetection()),

  makeWorker(QUEUES.rssSync, () => handleRssSync()),

  makeWorker(QUEUES.dailyRecsCheck, async (_data, log) => {
    const dispatched = await enqueueDailyRecsRebuild(db);
    if (dispatched > 0) log.info({ users: dispatched }, "recs refresh dispatched");
  }),

  makeWorker(QUEUES.mediaCadenceSweep, (_data, log) => handleMediaCadenceSweep(log)),

  makeWorker(QUEUES.seedManagement, () => handleSeedManagement()),

  makeWorker(QUEUES.folderScan, () => handleFolderScan()),

  makeWorker(QUEUES.validateDownloads, () => handleValidateDownloads()),

  makeWorker(QUEUES.repackSupersede, (_data, log) => handleRepackSupersede(log)),

  // ── On-demand (dispatched by other code) ──

  // Drains pre-existing in-flight `refresh-extras` jobs from older builds —
  // new dispatches go through `ensureMedia`. Keep until those jobs are gone
  // (Phase 1C-δ retires the queue + use-case together).
  makeWorker<{ mediaId: string }>(
    QUEUES.refreshExtras,
    async ({ mediaId }) => {
      const tmdb = await getTmdbProvider();
      await refreshExtras(db, mediaId, { tmdb });
    },
    { concurrency: 2 },
  ),

  makeWorker<{ userId: string }>(
    QUEUES.rebuildUserRecs,
    ({ userId }) => rebuildUserRecs(db, userId),
    { concurrency: 2 },
  ),

  // Drains pre-existing `translate-episodes` jobs from older builds — new
  // dispatches go through `ensureMedia`'s `translations` strategy.
  makeWorker<{ mediaId: string; tvdbId: number; language: string }>(
    QUEUES.translateEpisodes,
    async ({ mediaId, tvdbId, language }) => {
      const tvdb = await getTvdbProvider();
      await translateEpisodes(db, mediaId, tvdbId, language, tvdb);
    },
    { concurrency: 3 },
  ),

  // ── Unified ensureMedia engine ──

  makeWorker<EnsureMediaJob>(
    QUEUES.ensureMedia,
    async ({ mediaId, spec }) => {
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      await ensureMedia(db, mediaId, spec, { tmdb, tvdb });
    },
    { concurrency: 3 },
  ),
];

/* -------------------------------------------------------------------------- */
/*  Graceful shutdown                                                         */
/* -------------------------------------------------------------------------- */

async function shutdown(): Promise<void> {
  console.log("Shutting down...");
  await Promise.all([
    ...workers.map((w) => w.close()),
    ...Object.values(queues).map((q) => q.close()),
  ]);
  console.log("All workers shut down.");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/* -------------------------------------------------------------------------- */
/*  Startup                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Eagerly probe Redis before we accept jobs. BullMQ uses lazyConnect, so
 * without this check the worker process happily boots, schedulers silently
 * fail to register, and only the first dispatched job surfaces the outage —
 * usually much later, from a completely unrelated stack trace. Fail fast
 * instead so `docker-compose up` / systemd immediately flags a bad Redis.
 *
 * We piggyback on an existing Queue's Redis connection (reuses bullmq's own
 * ioredis instance) so we don't need ioredis as a direct dependency.
 */
async function probeRedis(): Promise<void> {
  const client = await queues.importTorrents.client;
  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error(`unexpected PING response: ${pong}`);
  }
  console.log(`[worker] Redis reachable at ${redisConnection.host}:${redisConnection.port}`);
}

async function main(): Promise<void> {
  await probeRedis();
  await setupSchedules();
  await seedLanguages(db);
  await seedDownloadDefaults(db);

  // One-shot denormalization backfill. Idempotent (skips fully-populated
  // rows via WHERE), runs only when there's something to fix. Heals users
  // whose recs were rebuilt before a denorm column was added.
  handleBackfillUserRecDenorm(db).catch((err) => {
    console.error("[worker] backfill-user-rec-denorm failed at boot:", err);
  });

  handleBackfillAspectState().catch((err) => {
    console.error("[worker] backfill-aspect-state failed at boot:", err);
  });

  console.log("Workers started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
