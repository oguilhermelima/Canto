import { Queue, Worker } from "bullmq";

import { handleImportTorrents } from "./jobs/import-torrents";
import { handleJellyfinSync, handlePlexSync } from "./jobs/reverse-sync";
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
import { seedGenres, seedLanguages } from "@canto/db";
import { getTmdbProvider } from "@canto/api/lib/tmdb-client";
import { getTvdbProvider } from "@canto/api/lib/tvdb-client";

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

const jellyfinSyncQueue = new Queue("jellyfin-sync", {
  connection: redisConnection,
});

const plexSyncQueue = new Queue("plex-sync", {
  connection: redisConnection,
});

const dailyRecsCheckQueue = new Queue("daily-recs-check", {
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

  // Jellyfin sync: every 5 minutes
  await jellyfinSyncQueue.upsertJobScheduler(
    "jellyfin-sync-scheduler",
    { every: 5 * 60 * 1000 },
    { name: "jellyfin-sync" },
  );

  // Plex sync: every 5 minutes (offset by 30s to avoid parallel TMDB calls)
  await plexSyncQueue.upsertJobScheduler(
    "plex-sync-scheduler",
    { every: 5 * 60 * 1000 },
    { name: "plex-sync" },
  );

  // Daily recs safety net: every hour, catches users with stale recommendations
  await dailyRecsCheckQueue.upsertJobScheduler(
    "daily-recs-check-scheduler",
    { every: 60 * 60 * 1000 },
    { name: "daily-recs-check" },
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

const jellyfinSyncWorker = new Worker(
  "jellyfin-sync",
  async (job) => {
    console.log(`[jellyfin-sync] Running job ${job.id}`);
    await handleJellyfinSync();
    console.log(`[jellyfin-sync] Completed job ${job.id}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const plexSyncWorker = new Worker(
  "plex-sync",
  async (job) => {
    console.log(`[plex-sync] Running job ${job.id}`);
    await handlePlexSync();
    console.log(`[plex-sync] Completed job ${job.id}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const enrichMediaWorker = new Worker(
  "enrich-media",
  async (job) => {
    const { mediaId, full } = job.data as { mediaId: string; full?: boolean };
    console.log(`[enrich-media] Running for media ${mediaId} (full=${full ?? true})`);
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    await enrichMedia(db, mediaId, { tmdb, tvdb, dispatcher: jobDispatcher, full });
    console.log(`[enrich-media] Completed for media ${mediaId}`);
  },
  { connection: redisConnection, concurrency: 3 },
);

const refreshExtrasWorker = new Worker(
  "refresh-extras",
  async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[refresh-extras] Running for media ${mediaId}`);
    const tmdb = await getTmdbProvider();
    await refreshExtras(db, mediaId, { tmdb });
    console.log(`[refresh-extras] Completed for media ${mediaId}`);
  },
  { connection: redisConnection, concurrency: 2 },
);

const replaceTvdbWorker = new Worker(
  "replace-tvdb",
  async (job) => {
    const { mediaId } = job.data as { mediaId: string };
    console.log(`[replace-tvdb] Running for media ${mediaId}`);
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    await replaceShowWithTvdb(db, mediaId, { tmdb, tvdb, dispatcher: jobDispatcher });
    console.log(`[replace-tvdb] Completed for media ${mediaId}`);
  },
  { connection: redisConnection, concurrency: 1 },
);

const dailyRecsCheckWorker = new Worker(
  "daily-recs-check",
  async () => {
    const users = await findUsersForDailyRecsCheck(db);
    if (users.length > 0) {
      console.log(`[daily-recs-check] ${users.length} user(s) need recs refresh`);
      for (const u of users) {
        await dispatchRebuildUserRecs(u.id);
      }
    }
  },
  { connection: redisConnection, concurrency: 1 },
);

const rebuildUserRecsWorker = new Worker(
  "rebuild-user-recs",
  async (job) => {
    const { userId } = job.data as { userId: string };
    console.log(`[rebuild-user-recs] Running for user ${userId}`);
    await rebuildUserRecs(db, userId);
    console.log(`[rebuild-user-recs] Completed for user ${userId}`);
  },
  { connection: redisConnection, concurrency: 2 },
);

const refreshAllLanguageWorker = new Worker(
  "refresh-all-language",
  async () => {
    console.log("[refresh-all-language] Starting full language refresh...");
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    await refreshAllLanguage(db, { tmdb, tvdb });
    console.log("[refresh-all-language] Completed.");
  },
  { connection: redisConnection, concurrency: 1 },
);

const translateEpisodesWorker = new Worker(
  "translate-episodes",
  async (job) => {
    const { mediaId, tvdbId, language } = job.data as { mediaId: string; tvdbId: number; language: string };
    const tvdb = await getTvdbProvider();
    await translateEpisodes(db, mediaId, tvdbId, language, tvdb);
  },
  { connection: redisConnection, concurrency: 3 },
);

/* -------------------------------------------------------------------------- */
/*  Error handling                                                            */
/* -------------------------------------------------------------------------- */

for (const worker of [
  importTorrentsWorker,
  jellyfinSyncWorker,
  plexSyncWorker,
  enrichMediaWorker,
  refreshExtrasWorker,
  replaceTvdbWorker,
  dailyRecsCheckWorker,
  rebuildUserRecsWorker,
  refreshAllLanguageWorker,
  translateEpisodesWorker,
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
    jellyfinSyncWorker.close(),
    plexSyncWorker.close(),
    enrichMediaWorker.close(),
    refreshExtrasWorker.close(),
    replaceTvdbWorker.close(),
    dailyRecsCheckWorker.close(),
    rebuildUserRecsWorker.close(),
    refreshAllLanguageWorker.close(),
    translateEpisodesWorker.close(),
    importTorrentsQueue.close(),
    jellyfinSyncQueue.close(),
    plexSyncQueue.close(),
    dailyRecsCheckQueue.close(),
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
  await seedLanguages(db);
  console.log("Workers started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});
