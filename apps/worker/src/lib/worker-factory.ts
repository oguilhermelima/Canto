import { Worker, type WorkerOptions } from "bullmq";
import { getRedisConnection } from "@canto/core/platform/queue/redis-config";

import { createJobLogger, type JobLogger } from "./job-logger";

export type JobHandler<TData> = (data: TData, log: JobLogger) => Promise<void>;

export interface MakeWorkerOpts extends Omit<WorkerOptions, "connection"> {
  concurrency?: number;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 10_000;

/**
 * Build a BullMQ `Worker` with the canonical defaults:
 * - shared Redis connection from `getRedisConnection()`
 * - `attempts: 3`, exponential backoff (10s base)
 * - `removeOnFail: 50`, `removeOnComplete: 50`
 * - a `{ queue, jobId }`-tagged logger injected into the handler
 * - single `failed` / `error` listener wired on the returned worker
 */
export function makeWorker<TData = unknown>(
  name: string,
  handler: JobHandler<TData>,
  opts: MakeWorkerOpts = {},
): Worker {
  const worker = new Worker(
    name,
    async (job) => {
      const log = createJobLogger(name, job.id);
      await handler(job.data as TData, log);
    },
    {
      connection: getRedisConnection(),
      concurrency: opts.concurrency ?? 1,
      ...opts,
    },
  );

  worker.on("failed", (job, err) => {
    const log = createJobLogger(name, job?.id);
    log.error({ err: err instanceof Error ? err.message : err }, "job failed");
  });

  worker.on("error", (err) => {
    const log = createJobLogger(name);
    log.error({ err: err instanceof Error ? err.message : err }, "worker error");
  });

  return worker;
}

/** Default job options applied to scheduled/on-demand add() calls. */
export const DEFAULT_JOB_OPTS = {
  attempts: DEFAULT_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: DEFAULT_BACKOFF_MS },
  removeOnComplete: 50,
  removeOnFail: 50,
};
