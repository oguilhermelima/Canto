import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import { cached } from "@canto/core/platform/cache/redis";
import Redis from "ioredis";

interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

let cacheInstance: CachePort | null = null;

function buildRedisCache(connection: RedisConnectionOptions): CachePort {
  const redis = new Redis({
    host: connection.host,
    port: connection.port,
    password: connection.password,
    lazyConnect: true,
  });

  return {
    async get<T>(key: string): Promise<T | null> {
      const hit = await redis.get(key);
      return hit ? (JSON.parse(hit) as T) : null;
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    },
    async invalidate(pattern: string): Promise<void> {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    },
    wrap<T>(
      key: string,
      ttlSeconds: number,
      fn: () => Promise<T>,
    ): Promise<T> {
      return cached(key, ttlSeconds, fn);
    },
  };
}

/**
 * Resolve the singleton {@link CachePort} adapter. Boots a Redis connection
 * on first call using `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` from
 * the environment. Composition roots (tRPC routers, worker entry points)
 * pass the returned port via deps so domain code never reaches the
 * `platform/cache` module directly.
 */
export function makeCache(): CachePort {
  if (cacheInstance) return cacheInstance;
  cacheInstance = buildRedisCache({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
  });
  return cacheInstance;
}
