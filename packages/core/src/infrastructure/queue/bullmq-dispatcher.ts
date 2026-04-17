import { Queue } from "bullmq";
import { QUEUES, type QueueName } from "./queue-names";
import { getRedisConnection } from "./redis-config";

const REMOVE_ON_FAIL = 50;

function createQueueGetter(name: QueueName): () => Promise<Queue> {
  let queue: Queue | null = null;
  return async () => {
    if (!queue) {
      queue = new Queue(name, { connection: getRedisConnection() });
    }
    return queue;
  };
}

const getRefreshExtrasQueue = createQueueGetter(QUEUES.refreshExtras);
const getReconcileShowQueue = createQueueGetter(QUEUES.reconcileShow);
const getRebuildUserRecsQueue = createQueueGetter(QUEUES.rebuildUserRecs);
const getRefreshAllLangQueue = createQueueGetter(QUEUES.refreshAllLanguage);
const getTranslateEpisodesQueue = createQueueGetter(QUEUES.translateEpisodes);
const getJellyfinSyncQueue = createQueueGetter(QUEUES.jellyfinSync);
const getPlexSyncQueue = createQueueGetter(QUEUES.plexSync);
const getReverseSyncUserQueue = createQueueGetter(QUEUES.reverseSyncUser);
const getTraktSyncUserQueue = createQueueGetter(QUEUES.traktSyncUser);
const getFolderScanQueue = createQueueGetter(QUEUES.folderScan);
const getMediaPipelineQueue = createQueueGetter(QUEUES.mediaPipeline);

export async function dispatchRefreshExtras(mediaId: string): Promise<void> {
  const q = await getRefreshExtrasQueue();
  await q.add(QUEUES.refreshExtras, { mediaId }, {
    jobId: `refresh-extras-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
}

export async function dispatchReconcileShow(mediaId: string): Promise<void> {
  const q = await getReconcileShowQueue();
  await q.add(QUEUES.reconcileShow, { mediaId }, {
    jobId: `reconcile-show-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
}

export async function dispatchRefreshAllLanguage(): Promise<void> {
  const q = await getRefreshAllLangQueue();
  await q.clean(0, 0, "failed").catch(() => {});
  await q.add(QUEUES.refreshAllLanguage, {}, {
    jobId: "refresh-all-language",
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
}

export async function dispatchRebuildUserRecs(userId: string): Promise<void> {
  const q = await getRebuildUserRecsQueue();
  await q.add(QUEUES.rebuildUserRecs, { userId }, {
    jobId: `rebuild-user-recs-${userId}`,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
}

export async function dispatchTranslateEpisodes(mediaId: string, tvdbId: number, language: string): Promise<void> {
  const q = await getTranslateEpisodesQueue();
  await q.add(QUEUES.translateEpisodes, { mediaId, tvdbId, language }, {
    jobId: `translate-eps-${mediaId}-${language}`,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
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
  return dispatchUniqueJob(q, `reverse-sync-user-${userId}`, { userId });
}

/**
 * Dispatch an on-demand Trakt sync for a single user.
 * Dedupes via jobId so frequent triggers collapse into one run.
 */
export async function dispatchUserTraktSync(userId: string): Promise<boolean> {
  const q = await getTraktSyncUserQueue();
  return dispatchUniqueJob(q, `trakt-sync-user-${userId}`, { userId });
}

/** Dispatch an on-demand folder scan job (deduplicates active/waiting jobs). */
export async function dispatchFolderScan(): Promise<boolean> {
  const q = await getFolderScanQueue();
  return dispatchUniqueJob(q, "folder-scan-run");
}

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
  await q.add(QUEUES.mediaPipeline, data, {
    jobId,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
}

/** Add a job only if no active/waiting job with the same ID exists. */
async function dispatchUniqueJob(
  queue: Queue,
  jobId: string,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting") return false;
    await existing.remove();
  }
  await queue.add(queue.name, data, {
    jobId,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
  return true;
}
