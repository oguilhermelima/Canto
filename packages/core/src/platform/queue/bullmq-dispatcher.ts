import { Queue } from "bullmq";
import { QUEUES  } from "./queue-names";
import type {QueueName} from "./queue-names";
import { getRedisConnection } from "./redis-config";
import type { EnsureMediaSpec } from "../../domain/media/use-cases/ensure-media.types";
import type { TraktSection } from "../../infra/trakt/trakt-sync-repository";

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
const getJellyfinSyncQueue = createQueueGetter(QUEUES.jellyfinSync);
const getPlexSyncQueue = createQueueGetter(QUEUES.plexSync);
const getReverseSyncUserQueue = createQueueGetter(QUEUES.reverseSyncUser);
const getTraktSyncUserQueue = createQueueGetter(QUEUES.traktSyncUser);
const getTraktSyncSectionQueue = createQueueGetter(QUEUES.traktSyncSection);
const getTraktListDeleteQueue = createQueueGetter(QUEUES.traktListDelete);
const getFolderScanQueue = createQueueGetter(QUEUES.folderScan);
const getEnsureMediaQueue = createQueueGetter(QUEUES.ensureMedia);
const getImportTorrentsQueue = createQueueGetter(QUEUES.importTorrents);

export async function dispatchRebuildUserRecs(userId: string): Promise<void> {
  const q = await getRebuildUserRecsQueue();
  await q.add(QUEUES.rebuildUserRecs, { userId }, {
    jobId: `rebuild-user-recs-${userId}`,
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

export interface TraktSyncSectionJob {
  connectionId: string;
  section: TraktSection;
  /** Remote `last_activities` timestamp at probe time. The section job sets
   *  this as the new watermark on successful completion. `null` is allowed
   *  for force-refresh paths where we don't have a probe to compare against. */
  remoteAtIso: string | null;
}

/**
 * Dispatch a single Trakt section job (pull + push for one surface).
 *
 * Dedupes via `jobId={connectionId}-{section}` — if the same section is
 * already waiting/active for a connection, we collapse to one. We always
 * preserve the latest `remoteAtIso` so the watermark advances to the most
 * recently observed value when the job finally runs.
 */
export async function dispatchTraktSyncSection(
  connectionId: string,
  section: TraktSection,
  remoteAtIso: string | null,
): Promise<void> {
  const q = await getTraktSyncSectionQueue();
  const jobId = `trakt-sync-section-${connectionId}-${section}`;
  const data: TraktSyncSectionJob = { connectionId, section, remoteAtIso };
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "waiting" || state === "delayed" || state === "active") {
      await existing.updateData(data);
      return;
    }
    await existing.remove().catch(() => {});
  }
  await q.add(QUEUES.traktSyncSection, data, {
    jobId,
    removeOnComplete: true,
    removeOnFail: REMOVE_ON_FAIL,
  });
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

/**
 * Dispatch an on-demand import-torrents run (deduplicates active/waiting jobs).
 *
 * The cron scheduler in apps/worker/src/index.ts fires the queue every 2 min;
 * any manual triggers (API endpoints, completion webhooks) should funnel
 * through this dispatcher so we never end up with two concurrent handlers
 * claiming non-overlapping subsets of the same download list.
 */
export async function dispatchImportTorrents(): Promise<boolean> {
  const q = await getImportTorrentsQueue();
  return dispatchUniqueJob(q, "import-torrents-run");
}

export interface EnsureMediaJob {
  mediaId: string;
  spec: EnsureMediaSpec;
}

/**
 * Enqueue an `ensureMedia` run. If a job for the same mediaId is already
 * waiting or active, merge the spec (union of languages + aspects, OR of
 * `force`) rather than creating a duplicate.
 *
 * Single entry point for every kind of media enrichment — replaces the
 * legacy `dispatchRefreshExtras` / `dispatchReconcileShow` /
 * `dispatchTranslateEpisodes` / `dispatchRefreshAllLanguage` /
 * `dispatchMediaPipeline` shells.
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
