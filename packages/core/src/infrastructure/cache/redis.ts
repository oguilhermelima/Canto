import type { CachePort } from "../../domain/ports/cache";
import Redis from "ioredis";

interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

function createRedisCache(connection: RedisConnectionOptions): CachePort {
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
  };
}

/* Singleton + cached() helper */

let cacheInstance: CachePort | null = null;

function getCache(): CachePort {
  if (!cacheInstance) {
    cacheInstance = createRedisCache({
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      password: process.env.REDIS_PASSWORD,
    });
  }
  return cacheInstance;
}

/**
 * Cache-through helper: returns cached value if available, otherwise calls fn() and caches the result.
 * Silently falls back to fn() if Redis is unavailable.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cache = getCache();
  try {
    const hit = await cache.get<T>(key);
    if (hit !== null) return hit;
  } catch {
    // Redis unavailable — proceed without cache
  }

  const result = await fn();

  try {
    await cache.set(key, result, ttlSeconds);
  } catch {
    // Redis unavailable — still return result
  }

  return result;
}
