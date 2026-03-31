import { Queue } from "bullmq";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";

let queue: Queue | null = null;

async function getQueue(): Promise<Queue> {
  if (!queue) {
    const host = (await getSetting(SETTINGS.REDIS_HOST)) ?? process.env.REDIS_HOST ?? "localhost";
    const port = parseInt((await getSetting(SETTINGS.REDIS_PORT)) ?? process.env.REDIS_PORT ?? "6379", 10);

    queue = new Queue("refresh-extras", {
      connection: { host, port },
    });
  }
  return queue;
}

export async function dispatchRefreshExtras(mediaId: string): Promise<void> {
  const q = await getQueue();
  await q.add("refresh-extras", { mediaId }, {
    jobId: `refresh-extras-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

let replaceTvdbQueue: Queue | null = null;

async function getReplaceTvdbQueue(): Promise<Queue> {
  if (!replaceTvdbQueue) {
    const host = (await getSetting(SETTINGS.REDIS_HOST)) ?? process.env.REDIS_HOST ?? "localhost";
    const port = parseInt((await getSetting(SETTINGS.REDIS_PORT)) ?? process.env.REDIS_PORT ?? "6379", 10);
    replaceTvdbQueue = new Queue("replace-tvdb", { connection: { host, port } });
  }
  return replaceTvdbQueue;
}

export async function dispatchReplaceWithTvdb(mediaId: string): Promise<void> {
  const q = await getReplaceTvdbQueue();
  await q.add("replace-tvdb", { mediaId }, {
    jobId: `replace-tvdb-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}

let replacePoolTvdbQueue: Queue | null = null;

async function getReplacePoolTvdbQueue(): Promise<Queue> {
  if (!replacePoolTvdbQueue) {
    const host = (await getSetting(SETTINGS.REDIS_HOST)) ?? process.env.REDIS_HOST ?? "localhost";
    const port = parseInt((await getSetting(SETTINGS.REDIS_PORT)) ?? process.env.REDIS_PORT ?? "6379", 10);
    replacePoolTvdbQueue = new Queue("replace-pool-tvdb", { connection: { host, port } });
  }
  return replacePoolTvdbQueue;
}

export async function dispatchReplacePoolShowsTvdb(mediaId: string): Promise<void> {
  const q = await getReplacePoolTvdbQueue();
  await q.add("replace-pool-tvdb", { mediaId }, {
    jobId: `replace-pool-tvdb-${mediaId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
