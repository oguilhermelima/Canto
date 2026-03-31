import { Queue, Worker } from "bullmq";

import { handleImportTorrents } from "./jobs/import-torrents";
import { handleReverseSync } from "./jobs/reverse-sync";
import { refreshExtras } from "@canto/api/domain/use-cases/refresh-extras";
import { replaceShowWithTvdb } from "@canto/api/domain/use-cases/replace-show-with-tvdb";
import { replacePoolShowsTvdb } from "@canto/api/domain/use-cases/replace-pool-shows-tvdb";
import { db } from "@canto/db/client";
import { seedGenres } from "@canto/db";

/* -------------------------------------------------------------------------- */
/*  Redis connection                                                          */
/* -------------------------------------------------------------------------- */

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
};

/* -------------------------------------------------------------------------- */
/*  Queue definitions                                                         */
/* -------------------------------------------------------------------------- */

const importTorrentsQueue = new Queue("import-torrents", {
  connection: redisConnection,
});

const reverseSyncQueue = new Queue("reverse-sync", {
  connection: redisConnection,
});

/* -------------------------------------------------------------------------- */
/*  Repeatable jobs (cron-like schedules)                                     */
/* -------------------------------------------------------------------------- */

async function setupRepeatableJobs(): Promise<void> {
  // Import torrents: every 2 minutes
  await importTorrentsQueue.upsertJobScheduler(
    "import-torrents-scheduler",
    { every: 2 * 60 * 1000 },
    { name: "import-torrents" },
  );

  // Reverse sync (import from Jellyfin/Plex): every 5 minutes
  await reverseSyncQueue.upsertJobScheduler(
    "reverse-sync-scheduler",
    { every: 5 * 60 * 1000 },
    { name: "reverse-sync" },
  );
}

/* -------------------------------------------------------------------------- */
/*  Workers                                                                   */
/* -------------------------------------------------------------------------- */

const importTorrentsWorker = new Worker(
  "import-torrents",
  async (job) => {
    console.log(`[import-torrents] Running job ${job.id}`);
    await handleImportTorrents();
    console.log(`[import-torrents] Completed job ${job.id}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const reverseSyncWorker = new Worker(
  "reverse-sync",
  async (job) => {
    console.log(`[reverse-sync] Running job ${job.id}`);
    await handleReverseSync();
    console.log(`[reverse-sync] Completed job ${job.id}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const refreshExtrasWorker = new Worker(
  "refresh-extras",
  async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[refresh-extras] Running for media ${mediaId}`);
    await refreshExtras(db, mediaId);
    console.log(`[refresh-extras] Completed for media ${mediaId}`);
  },
  { connection: redisConnection, concurrency: 2 },
);

const replaceTvdbWorker = new Worker(
  "replace-tvdb",
  async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[replace-tvdb] Running for media ${mediaId}`);
    await replaceShowWithTvdb(db, mediaId);
    console.log(`[replace-tvdb] Completed for media ${mediaId}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const replacePoolTvdbWorker = new Worker(
  "replace-pool-tvdb",
  async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[replace-pool-tvdb] Running for source ${mediaId}`);
    await replacePoolShowsTvdb(db, mediaId);
    console.log(`[replace-pool-tvdb] Completed for source ${mediaId}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

/* -------------------------------------------------------------------------- */
/*  Error handling                                                            */
/* -------------------------------------------------------------------------- */

for (const worker of [
  importTorrentsWorker,
  reverseSyncWorker,
  refreshExtrasWorker,
  replaceTvdbWorker,
  replacePoolTvdbWorker,
]) {
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
  console.log("Shutting down workers...");
  await Promise.all([
    importTorrentsWorker.close(),
    reverseSyncWorker.close(),
    refreshExtrasWorker.close(),
    replaceTvdbWorker.close(),
    replacePoolTvdbWorker.close(),
    importTorrentsQueue.close(),
    reverseSyncQueue.close(),
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
  console.log("Setting up repeatable jobs...");
  await setupRepeatableJobs();
  await seedGenres(db);
  console.log("Workers started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
