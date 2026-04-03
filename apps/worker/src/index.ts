import { Queue, Worker } from "bullmq";

import { handleImportTorrents } from "./jobs/import-torrents";
import { handleJellyfinSync, handlePlexSync } from "./jobs/reverse-sync";
import { handleStallDetection } from "./jobs/stall-detection";
import { handleRssSync } from "./jobs/rss-sync";
import { handleBackfillExtras } from "./jobs/backfill-extras";
import { enrichMedia } from "@canto/api/domain/use-cases/enrich-media";
import { refreshExtras } from "@canto/api/domain/use-cases/refresh-extras";
import { replaceShowWithTvdb } from "@canto/api/domain/use-cases/replace-show-with-tvdb";
import { rebuildUserRecs } from "@canto/api/domain/use-cases/rebuild-user-recs";
import { refreshAllLanguage } from "@canto/api/domain/use-cases/refresh-all-language";
import { translateEpisodes } from "@canto/api/domain/use-cases/translate-episodes";
import { findUsersForDailyRecsCheck } from "@canto/api/infrastructure/repositories/user-recommendation-repository";
import { dispatchRebuildUserRecs } from "@canto/api/infrastructure/queue/bullmq-dispatcher";
import { jobDispatcher } from "@canto/api/infrastructure/adapters/job-dispatcher.adapter";
import { db } from "@canto/db/client";
import { seedLanguages } from "@canto/db";
import { getTmdbProvider } from "@canto/api/lib/tmdb-client";
import { getTvdbProvider } from "@canto/api/lib/tvdb-client";

/* -------------------------------------------------------------------------- */
/*  Redis                                                                     */
/* -------------------------------------------------------------------------- */

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
};

/* -------------------------------------------------------------------------- */
/*  Queues                                                                    */
/* -------------------------------------------------------------------------- */

const queues = {
  importTorrents: new Queue("import-torrents", { connection: redisConnection }),
  jellyfinSync: new Queue("jellyfin-sync", { connection: redisConnection }),
  plexSync: new Queue("plex-sync", { connection: redisConnection }),
  stallDetection: new Queue("stall-detection", { connection: redisConnection }),
  rssSync: new Queue("rss-sync", { connection: redisConnection }),
  dailyRecsCheck: new Queue("daily-recs-check", { connection: redisConnection }),
  backfillExtras: new Queue("backfill-extras", { connection: redisConnection }),
};

/* -------------------------------------------------------------------------- */
/*  Schedules                                                                 */
/* -------------------------------------------------------------------------- */

async function setupSchedules(): Promise<void> {
  await queues.importTorrents.upsertJobScheduler(
    "import-torrents-scheduler",
    { every: 2 * 60 * 1000 },          // 2 min
    { name: "import-torrents" },
  );

  await queues.jellyfinSync.upsertJobScheduler(
    "jellyfin-sync-scheduler",
    { every: 5 * 60 * 1000 },          // 5 min
    { name: "jellyfin-sync" },
  );

  await queues.plexSync.upsertJobScheduler(
    "plex-sync-scheduler",
    { every: 5 * 60 * 1000 },          // 5 min
    { name: "plex-sync" },
  );

  await queues.stallDetection.upsertJobScheduler(
    "stall-detection-scheduler",
    { every: 30 * 60 * 1000 },         // 30 min
    { name: "stall-detection" },
  );

  await queues.rssSync.upsertJobScheduler(
    "rss-sync-scheduler",
    { every: 15 * 60 * 1000 },         // 15 min
    { name: "rss-sync" },
  );

  await queues.dailyRecsCheck.upsertJobScheduler(
    "daily-recs-check-scheduler",
    { every: 60 * 60 * 1000 },         // 1 hour
    { name: "daily-recs-check" },
  );

  await queues.backfillExtras.upsertJobScheduler(
    "backfill-extras-scheduler",
    { every: 60 * 60 * 1000 },         // 1 hour
    { name: "backfill-extras" },
  );
}

/* -------------------------------------------------------------------------- */
/*  Workers                                                                   */
/* -------------------------------------------------------------------------- */

const workers = [
  // ── Scheduled (cron) ──

  new Worker("import-torrents", async (job) => {
    console.log(`[import-torrents] Running job ${job.id}`);
    await handleImportTorrents();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("jellyfin-sync", async (job) => {
    console.log(`[jellyfin-sync] Running job ${job.id}`);
    await handleJellyfinSync();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("plex-sync", async (job) => {
    console.log(`[plex-sync] Running job ${job.id}`);
    await handlePlexSync();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("stall-detection", async (job) => {
    console.log(`[stall-detection] Running job ${job.id}`);
    await handleStallDetection();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("rss-sync", async (job) => {
    console.log(`[rss-sync] Running job ${job.id}`);
    await handleRssSync();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("daily-recs-check", async () => {
    const users = await findUsersForDailyRecsCheck(db);
    if (users.length > 0) {
      console.log(`[daily-recs-check] ${users.length} user(s) need recs refresh`);
      for (const u of users) await dispatchRebuildUserRecs(u.id);
    }
  }, { connection: redisConnection, concurrency: 1 }),

  // Backfill: queries IDs with missing extras → dispatches to refresh-extras queue
  new Worker("backfill-extras", async () => {
    await handleBackfillExtras(db);
  }, { connection: redisConnection, concurrency: 1 }),

  // ── On-demand (dispatched by other code) ──

  new Worker("enrich-media", async (job) => {
    const { mediaId, full } = job.data as { mediaId: string; full?: boolean };
    console.log(`[enrich-media] ${mediaId} (full=${full ?? true})`);
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    await enrichMedia(db, mediaId, { tmdb, tvdb, dispatcher: jobDispatcher, full });
  }, { connection: redisConnection, concurrency: 3 }),

  new Worker("refresh-extras", async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[refresh-extras] ${mediaId}`);
    const tmdb = await getTmdbProvider();
    await refreshExtras(db, mediaId, { tmdb });
  }, { connection: redisConnection, concurrency: 2 }),

  new Worker("replace-tvdb", async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[replace-tvdb] ${mediaId}`);
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    await replaceShowWithTvdb(db, mediaId, { tmdb, tvdb, dispatcher: jobDispatcher });
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("rebuild-user-recs", async (job) => {
    const { userId } = job.data as { userId: string };
    console.log(`[rebuild-user-recs] ${userId}`);
    await rebuildUserRecs(db, userId);
  }, { connection: redisConnection, concurrency: 2 }),

  new Worker("refresh-all-language", async () => {
    console.log("[refresh-all-language] Starting...");
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    await refreshAllLanguage(db, { tmdb, tvdb });
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("translate-episodes", async (job) => {
    const { mediaId, tvdbId, language } = job.data as { mediaId: string; tvdbId: number; language: string };
    const tvdb = await getTvdbProvider();
    await translateEpisodes(db, mediaId, tvdbId, language, tvdb);
  }, { connection: redisConnection, concurrency: 3 }),
];

/* -------------------------------------------------------------------------- */
/*  Error handling                                                            */
/* -------------------------------------------------------------------------- */

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, err);
  });
  worker.on("error", (err) => {
    console.error(`[${worker.name}] Worker error:`, err);
  });
}

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

async function main(): Promise<void> {
  await setupSchedules();
  await seedLanguages(db);
  console.log("Workers started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
