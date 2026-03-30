import { Queue } from "bullmq";
import { getSetting } from "@canto/db/settings";

let queue: Queue | null = null;

async function getQueue(): Promise<Queue> {
  if (!queue) {
    const host = (await getSetting("redis.host")) ?? process.env.REDIS_HOST ?? "localhost";
    const port = parseInt((await getSetting("redis.port")) ?? process.env.REDIS_PORT ?? "6379", 10);

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
