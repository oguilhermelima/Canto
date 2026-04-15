import { Queue } from "bullmq";
import { getSettings } from "@canto/db/settings";

function createQueueGetter(name: string): () => Promise<Queue> {
  let queue: Queue | null = null;
  return async () => {
    if (!queue) {
      const { "redis.host": host, "redis.port": port } = await getSettings([
        "redis.host",
        "redis.port",
      ]);
      queue = new Queue(name, {
        connection: { host: host ?? "localhost", port: port ?? 6379 },
      });
    }
    return queue;
  };
}

const getEnrichMediaQueue = createQueueGetter("enrich-media");
const getRefreshExtrasQueue = createQueueGetter("refresh-extras");
const getReplaceTvdbQueue = createQueueGetter("replace-tvdb");
const getRebuildUserRecsQueue = createQueueGetter("rebuild-user-recs");
const getRefreshAllLangQueue = createQueueGetter("refresh-all-language");
const getTranslateEpisodesQueue = createQueueGetter("translate-episodes");
const getJellyfinSyncQueue = createQueueGetter("jellyfin-sync");
const getPlexSyncQueue = createQueueGetter("plex-sync");
const getReverseSyncUserQueue = createQueueGetter("reverse-sync-user");
const getFolderScanQueue = createQueueGetter("folder-scan");

export async function dispatchEnrichMedia(mediaId: string, full = false): Promise<void> {
  const q = await getEnrichMediaQueue();
  await q.add("enrich-media", { mediaId, full }, {
    jobId: `enrich-media-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

export async function dispatchRefreshExtras(mediaId: string): Promise<void> {
  const q = await getRefreshExtrasQueue();
  await q.add("refresh-extras", { mediaId }, {
    jobId: `refresh-extras-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

export async function dispatchReconcileShow(mediaId: string): Promise<void> {
  const q = await getReplaceTvdbQueue();
  await q.add("replace-tvdb", { mediaId }, {
    jobId: `replace-tvdb-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

export async function dispatchRefreshAllLanguage(): Promise<void> {
  const q = await getRefreshAllLangQueue();
  await q.clean(0, 0, "failed").catch(() => {});
  await q.add("refresh-all-language", {}, {
    jobId: "refresh-all-language",
    removeOnComplete: true,
    removeOnFail: 5,
  });
}

export async function dispatchRebuildUserRecs(userId: string): Promise<void> {
  const q = await getRebuildUserRecsQueue();
  await q.add("rebuild-user-recs", { userId }, {
    jobId: `rebuild-user-recs-${userId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

export async function dispatchTranslateEpisodes(mediaId: string, tvdbId: number, language: string): Promise<void> {
  const q = await getTranslateEpisodesQueue();
  await q.add("translate-episodes", { mediaId, tvdbId, language }, {
    jobId: `translate-eps-${mediaId}-${language}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

/** Dispatch a one-off Jellyfin sync job (deduplicates active/waiting jobs). */
export async function dispatchJellyfinSync(): Promise<boolean> {
  const q = await getJellyfinSyncQueue();
  return dispatchUniqueJob(q, "jellyfin-sync-run");
}

/** Dispatch a one-off Plex sync job (deduplicates active/waiting jobs). */
export async function dispatchPlexSync(): Promise<boolean> {
  const q = await getPlexSyncQueue();
  return dispatchUniqueJob(q, "plex-sync-run");
}

/**
 * Dispatch an on-demand reverse-sync for a single user. Dedupes via jobId so
 * rapid app-focus triggers collapse into one run per user.
 */
export async function dispatchUserReverseSync(userId: string): Promise<boolean> {
  const q = await getReverseSyncUserQueue();
  const jobId = `reverse-sync-user-${userId}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting") return false;
    await existing.remove();
  }
  await q.add(q.name, { userId }, { jobId, removeOnComplete: true, removeOnFail: 50 });
  return true;
}

/** Dispatch an on-demand folder scan job (deduplicates active/waiting jobs). */
export async function dispatchFolderScan(): Promise<boolean> {
  const q = await getFolderScanQueue();
  return dispatchUniqueJob(q, "folder-scan-run");
}

/** Add a job only if no active/waiting job with the same ID exists. */
const getMediaPipelineQueue = createQueueGetter("media-pipeline");

export interface MediaPipelineJob {
  externalId?: number;
  provider?: string;
  type?: string;
  mediaId?: string;
  useTVDBSeasons?: boolean;
}

export async function dispatchMediaPipeline(data: MediaPipelineJob): Promise<void> {
  const q = await getMediaPipelineQueue();
  const jobId = data.mediaId
    ? `media-pipeline-${data.mediaId}`
    : `media-pipeline-${data.provider}-${data.externalId}`;
  await q.add("media-pipeline", data, {
    jobId,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

/** Add a job only if no active/waiting job with the same ID exists. */
async function dispatchUniqueJob(queue: Queue, jobId: string): Promise<boolean> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting") return false;
    await existing.remove();
  }
  await queue.add(queue.name, {}, { jobId });
  return true;
}
