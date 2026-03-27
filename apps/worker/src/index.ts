import { Queue, Worker } from "bullmq";

import { handleCleanupCache } from "./jobs/cleanup-cache";
import { handleImportTorrents } from "./jobs/import-torrents";
import { handleRefreshMetadata } from "./jobs/refresh-metadata";

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

const refreshMetadataQueue = new Queue("refresh-metadata", {
  connection: redisConnection,
});

const cleanupCacheQueue = new Queue("cleanup-cache", {
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

  // Refresh metadata: every Sunday at 03:00
  await refreshMetadataQueue.upsertJobScheduler(
    "refresh-metadata-scheduler",
    { pattern: "0 3 * * 0" },
    { name: "refresh-metadata" },
  );

  // Cleanup cache: every day at 04:00
  await cleanupCacheQueue.upsertJobScheduler(
    "cleanup-cache-scheduler",
    { pattern: "0 4 * * *" },
    { name: "cleanup-cache" },
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

const refreshMetadataWorker = new Worker(
  "refresh-metadata",
  async (job) => {
    console.log(`[refresh-metadata] Running job ${job.id}`);
    await handleRefreshMetadata();
    console.log(`[refresh-metadata] Completed job ${job.id}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const cleanupCacheWorker = new Worker(
  "cleanup-cache",
  async (job) => {
    console.log(`[cleanup-cache] Running job ${job.id}`);
    await handleCleanupCache();
    console.log(`[cleanup-cache] Completed job ${job.id}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

/* -------------------------------------------------------------------------- */
/*  Error handling                                                            */
/* -------------------------------------------------------------------------- */

for (const worker of [
  importTorrentsWorker,
  refreshMetadataWorker,
  cleanupCacheWorker,
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
    refreshMetadataWorker.close(),
    cleanupCacheWorker.close(),
    importTorrentsQueue.close(),
    refreshMetadataQueue.close(),
    cleanupCacheQueue.close(),
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
  console.log("Workers started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
