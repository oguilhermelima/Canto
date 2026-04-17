export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
}

/**
 * Single source of truth for the Redis connection used by every
 * BullMQ producer and consumer. Reads `REDIS_HOST` / `REDIS_PORT` /
 * `REDIS_PASSWORD` from the environment so the API, web, core use-cases,
 * and the worker process all connect to the same Redis instance.
 *
 * Previously the dispatcher pulled these values from DB settings while the
 * worker pulled them from env — producing jobs on one Redis and consuming
 * them from another when the two diverged.
 */
export function getRedisConnection(): RedisConnection {
  const host = process.env.REDIS_HOST ?? "localhost";
  const port = parseInt(process.env.REDIS_PORT ?? "6379", 10);
  const password = process.env.REDIS_PASSWORD;
  return password ? { host, port, password } : { host, port };
}
