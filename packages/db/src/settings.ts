import { eq } from "drizzle-orm";

import { db } from "./client";
import { systemSetting } from "./schema";

/* -------------------------------------------------------------------------- */
/*  In-memory cache with TTL                                                  */
/* -------------------------------------------------------------------------- */

const cache = new Map<string, { value: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/* -------------------------------------------------------------------------- */
/*  Env var fallback map                                                      */
/* -------------------------------------------------------------------------- */

const ENV_FALLBACK: Record<string, string | undefined> = {
  "tmdb.apiKey": process.env.TMDB_API_KEY,
  "jellyfin.url": process.env.JELLYFIN_URL,
  "jellyfin.apiKey": process.env.JELLYFIN_API_KEY,
  "plex.url": undefined,
  "plex.token": undefined,
  "qbittorrent.url": process.env.QBITTORRENT_URL,
  "qbittorrent.username": process.env.QBITTORRENT_USERNAME,
  "qbittorrent.password": process.env.QBITTORRENT_PASSWORD,
  "prowlarr.url": process.env.PROWLARR_URL,
  "prowlarr.apiKey": process.env.PROWLARR_API_KEY,
  "mediaServer.host": process.env.MEDIA_SERVER_HOST,
  "mediaServer.user": process.env.MEDIA_SERVER_USER,
};

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Get a setting value. Checks: in-memory cache → DB → env var fallback.
 */
export async function getSetting<T = string>(
  key: string,
): Promise<T | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  try {
    const row = await db.query.systemSetting.findFirst({
      where: eq(systemSetting.key, key),
    });

    if (row) {
      cache.set(key, { value: row.value, expiresAt: Date.now() + CACHE_TTL_MS });
      return row.value as T;
    }
  } catch {
    // DB not available yet (e.g. during migrations) — fall through to env
  }

  const envValue = ENV_FALLBACK[key];
  if (envValue !== undefined && envValue !== "") {
    return envValue as T;
  }

  return null;
}

/**
 * Upsert a setting value and update the cache.
 */
export async function setSetting(
  key: string,
  value: unknown,
): Promise<void> {
  await db
    .insert(systemSetting)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value, updatedAt: new Date() },
    });
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Delete a setting.
 */
export async function deleteSetting(key: string): Promise<void> {
  await db.delete(systemSetting).where(eq(systemSetting.key, key));
  cache.delete(key);
}

/**
 * Get all settings as a key-value record.
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db.query.systemSetting.findMany();
  const result: Record<string, unknown> = {};

  // Start with env fallbacks
  for (const [key, envVal] of Object.entries(ENV_FALLBACK)) {
    if (envVal !== undefined && envVal !== "") {
      result[key] = envVal;
    }
  }

  // DB values override env
  for (const row of rows) {
    result[row.key] = row.value;
    cache.set(row.key, { value: row.value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return result;
}

/**
 * Invalidate cache for a specific key or all keys.
 */
export function invalidateSettingsCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
