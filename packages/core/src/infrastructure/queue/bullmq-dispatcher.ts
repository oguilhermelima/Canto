import { Queue } from "bullmq";
import { QUEUES, type QueueName } from "./queue-names";
import { getRedisConnection } from "./redis-config";
import type { EnsureMediaSpec } from "../../domain/use-cases/media/ensure-media.types";

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

const getRebuildUserRecsQueue = createQueueGetter(QUEUES.rebuildUserRecs);
const getRefreshAllLangQueue = createQueueGetter(QUEUES.refreshAllLanguage);
const getJellyfinSyncQueue = createQueueGetter(QUEUES.jellyfinSync);
const getPlexSyncQueue = createQueueGetter(QUEUES.plexSync);
const getReverseSyncUserQueue = createQueueGetter(QUEUES.reverseSyncUser);
const getTraktSyncUserQueue = createQueueGetter(QUEUES.traktSyncUser);
const getTraktListDeleteQueue = createQueueGetter(QUEUES.traktListDelete);
const getFolderScanQueue = createQueueGetter(QUEUES.folderScan);
const getMediaPipelineQueue = createQueueGetter(QUEUES.mediaPipeline);
const getEnsureMediaQueue = createQueueGetter(QUEUES.ensureMedia);

/**
 * Legacy shell — redirects to the unified ensureMedia engine.
 * The standalone `refresh-extras` queue is kept defined so any in-flight
 * jobs from older builds still drain; new dispatches go through ensureMedia.
 */
export async function dispatchRefreshExtras(mediaId: string): Promise<void> {
  await dispatchEnsureMedia(mediaId, { aspects: ["extras"] });
}

/**
 * Legacy shell — redirects to the unified ensureMedia engine.
 */
export async function dispatchReconcileShow(mediaId: string): Promise<void> {
  await dispatchEnsureMedia(mediaId, { aspects: ["structure"], force: true });
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

/**
 * Legacy shell — redirects to the unified ensureMedia engine, which now
 * handles TVDB episode-translation fallback as part of the `translations`
 * aspect.
 */
export async function dispatchTranslateEpisodes(
  mediaId: string,
  _tvdbId: number,
  language: string,
): Promise<void> {
  await dispatchEnsureMedia(mediaId, {
    aspects: ["translations"],
    languages: [language],
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

/**
 * Dispatch a Trakt list deletion job. Idempotent per `localListId` — if a
 * delete job is already enqueued or running, this is a no-op. The worker
 * picks up the tombstoned `list` row, calls Trakt's DELETE endpoint, then
 * hard-deletes the local row (cascade clears the link).
 */
export async function dispatchTraktListDelete(
  localListId: string,
): Promise<boolean> {
  const q = await getTraktListDeleteQueue();
  return dispatchUniqueJob(q, `trakt-list-delete-${localListId}`, { localListId });
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

export interface EnsureMediaJob {
  mediaId: string;
  spec: EnsureMediaSpec;
}

/**
 * Enqueue an `ensureMedia` run. If a job for the same mediaId is already
 * waiting or active, merge the spec (union of languages + aspects, OR of
 * `force`) rather than creating a duplicate.
 */
export async function dispatchEnsureMedia(
  mediaId: string,
  spec: EnsureMediaSpec = {},
): Promise<void> {
  const q = await getEnsureMediaQueue();
  const jobId = `ensure-media-${mediaId}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "waiting" || state === "delayed" || state === "active") {
      const merged = mergeSpecs(
        (existing.data as EnsureMediaJob | undefined)?.spec ?? {},
        spec,
      );
      await existing.updateData({ mediaId, spec: merged });
      return;
    }
    await existing.remove().catch(() => {});
  }
  await q.add(QUEUES.ensureMedia, { mediaId, spec }, {
    jobId,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
}

function mergeSpecs(a: EnsureMediaSpec, b: EnsureMediaSpec): EnsureMediaSpec {
  const langs = a.languages || b.languages
    ? [...new Set([...(a.languages ?? []), ...(b.languages ?? [])])]
    : undefined;
  const aspects = a.aspects || b.aspects
    ? [...new Set([...(a.aspects ?? []), ...(b.aspects ?? [])])]
    : undefined;
  return {
    languages: langs,
    aspects,
    force: !!a.force || !!b.force,
  };
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
