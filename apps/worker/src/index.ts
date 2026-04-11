import { Queue, Worker } from "bullmq";

import { handleImportTorrents } from "./jobs/import-torrents";
import {
  handleJellyfinSync,
  handlePlexSync,
  handleReverseSyncFull,
  handleReverseSyncUser,
} from "./jobs/reverse-sync";
import { handleStallDetection } from "./jobs/stall-detection";
import { handleRssSync } from "./jobs/rss-sync";
import { handleBackfillExtras } from "./jobs/backfill-extras";
import { handleSeedManagement } from "./jobs/seed-management";
import { handleFolderScan } from "./jobs/folder-scan";
import { handleValidateDownloads } from "./jobs/validate-downloads";
import { enrichMedia } from "@canto/core/domain/use-cases/enrich-media";
import { refreshExtras } from "@canto/core/domain/use-cases/refresh-extras";
import { replaceShowWithTvdb } from "@canto/core/domain/use-cases/replace-show-with-tvdb";
import { rebuildUserRecs } from "@canto/core/domain/use-cases/rebuild-user-recs";
import { refreshAllLanguage } from "@canto/core/domain/use-cases/refresh-all-language";
import { translateEpisodes } from "@canto/core/domain/use-cases/translate-episodes";
import { fetchMediaMetadata } from "@canto/core/domain/use-cases/fetch-media-metadata";
import type { ProviderName, MediaType } from "@canto/providers";
import { findUsersForDailyRecsCheck } from "@canto/core/infrastructure/repositories/user-recommendation-repository";
import { findMediaById } from "@canto/core/infrastructure/repositories";
import { dispatchRebuildUserRecs, dispatchTranslateEpisodes } from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import type { MediaPipelineJob } from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import { jobDispatcher } from "@canto/core/infrastructure/adapters/job-dispatcher.adapter";
import { SETTINGS } from "@canto/core/lib/settings-keys";
import { db } from "@canto/db/client";
import { seedLanguages } from "@canto/db";
import { getSetting } from "@canto/db/settings";
import { getSupportedLanguageCodes, persistFullMedia } from "@canto/db/persist-media";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { getTvdbProvider } from "@canto/core/lib/tvdb-client";

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
  reverseSyncFull: new Queue("reverse-sync-full", { connection: redisConnection }),
  reverseSyncUser: new Queue("reverse-sync-user", { connection: redisConnection }),
  stallDetection: new Queue("stall-detection", { connection: redisConnection }),
  rssSync: new Queue("rss-sync", { connection: redisConnection }),
  dailyRecsCheck: new Queue("daily-recs-check", { connection: redisConnection }),
  backfillExtras: new Queue("backfill-extras", { connection: redisConnection }),
  seedManagement: new Queue("seed-management", { connection: redisConnection }),
  folderScan: new Queue("folder-scan", { connection: redisConnection }),
  validateDownloads: new Queue("validate-downloads", { connection: redisConnection }),
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
    { every: 2 * 60 * 1000 },          // 2 min
    { name: "import-torrents" },
  );

  await queues.jellyfinSync.upsertJobScheduler(
    "jellyfin-sync-scheduler",
    { every: 5 * 60 * 1000, startDate: jitterStart(60 * 1000) },
    { name: "jellyfin-sync" },
  );

  await queues.plexSync.upsertJobScheduler(
    "plex-sync-scheduler",
    { every: 5 * 60 * 1000, startDate: jitterStart(60 * 1000) },
    { name: "plex-sync" },
  );

  // Daily full scan — ignores per-link delta checkpoints so deletion
  // detection (prune of stale media_version / user_media_library rows) still
  // runs at least once every 24h. The 5-min jellyfin/plex jobs only do
  // delta scans and cannot detect items removed on the server.
  await queues.reverseSyncFull.upsertJobScheduler(
    "reverse-sync-full-scheduler",
    { every: 24 * 60 * 60 * 1000, startDate: jitterStart(10 * 60 * 1000) },
    { name: "reverse-sync-full" },
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

  await queues.seedManagement.upsertJobScheduler(
    "seed-management-scheduler",
    { every: 15 * 60 * 1000 },         // 15 min
    { name: "seed-management" },
  );

  await queues.folderScan.upsertJobScheduler(
    "folder-scan-scheduler",
    { every: 30 * 60 * 1000 },         // 30 min
    { name: "folder-scan" },
  );

  await queues.validateDownloads.upsertJobScheduler(
    "validate-downloads-scheduler",
    { every: 6 * 60 * 60 * 1000 },    // 6 hours
    { name: "validate-downloads" },
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

  new Worker("reverse-sync-full", async (job) => {
    console.log(`[reverse-sync-full] Running job ${job.id}`);
    await handleReverseSyncFull();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("reverse-sync-user", async (job) => {
    const { userId } = job.data as { userId: string };
    if (!userId) {
      console.warn(`[reverse-sync-user] Job ${job.id} missing userId, skipping`);
      return;
    }
    console.log(`[reverse-sync-user] Running job ${job.id} for user ${userId}`);
    await handleReverseSyncUser(userId);
  }, { connection: redisConnection, concurrency: 2 }),

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

  new Worker("seed-management", async (job) => {
    console.log(`[seed-management] Running job ${job.id}`);
    await handleSeedManagement();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("folder-scan", async (job) => {
    console.log(`[folder-scan] Running job ${job.id}`);
    await handleFolderScan();
  }, { connection: redisConnection, concurrency: 1 }),

  new Worker("validate-downloads", async (job) => {
    console.log(`[validate-downloads] Running job ${job.id}`);
    await handleValidateDownloads();
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

  // ── Unified media pipeline ──

  new Worker("media-pipeline", async (job) => {
    const data = job.data as MediaPipelineJob;
    const { getEffectiveProviderSync } = await import("@canto/core/domain/rules/effective-provider");
    const globalTvdbEnabled = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;
    const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
    const supportedLangs = [...await getSupportedLanguageCodes(db)];

    let externalId: number;
    let provider: ProviderName;
    let type: MediaType;
    let existingId: string | undefined;
    let useTVDBSeasons: boolean;

    if (data.mediaId) {
      const row = await findMediaById(db, data.mediaId);
      if (!row) return;
      externalId = row.externalId;
      provider = row.provider as ProviderName;
      type = row.type as MediaType;
      existingId = row.id;
      useTVDBSeasons = getEffectiveProviderSync(row, globalTvdbEnabled) === "tvdb";
      console.log(`[media-pipeline] Reprocessing: ${row.title} (${row.id})`);
    } else {
      externalId = data.externalId!;
      provider = data.provider! as ProviderName;
      type = data.type! as MediaType;
      useTVDBSeasons = data.useTVDBSeasons ?? globalTvdbEnabled;
      console.log(`[media-pipeline] Processing: ${provider}/${externalId}`);
    }

    const result = await fetchMediaMetadata(
      externalId, provider, type,
      { tmdb, tvdb },
      { reprocess: !!existingId, useTVDBSeasons, supportedLanguages: supportedLangs },
    );

    const mediaId = await persistFullMedia(db, result, existingId);

    if (result.tvdbId && result.tvdbSeasons?.length) {
      const nonEnLangs = supportedLangs.filter(l => !l.startsWith("en"));
      for (const lang of nonEnLangs) {
        void dispatchTranslateEpisodes(mediaId, result.tvdbId, lang).catch(() => {});
      }
    }

    console.log(`[media-pipeline] Done: ${result.media.title} → ready`);
  }, { connection: redisConnection, concurrency: 5 }),
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
