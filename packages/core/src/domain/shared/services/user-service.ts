import { eq, isNotNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { user } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";

import { MS_PER_MINUTE } from "@canto/core/domain/shared/constants";

/** Resolve user's preferred language (defaults to en-US) */
export async function getUserLanguage(db: Database, userId: string): Promise<string> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { language: true },
  });
  return row?.language ?? "en-US";
}

/**
 * Resolve the user's watch region + language together. Used by discovery
 * procedures (spotlight, top10, genre tiles) that need both to key caches.
 */
export async function getUserWatchPreferences(
  db: Database,
  userId: string,
): Promise<{ language: string; watchRegion: string }> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { language: true, watchRegion: true },
  });
  return {
    language: row?.language ?? "en-US",
    watchRegion: row?.watchRegion ?? "US",
  };
}

let activeUserLanguagesCache: Set<string> | null = null;
let activeUserLanguagesCacheTime = 0;
const CACHE_TTL_MS = 5 * MS_PER_MINUTE;

/**
 * Return the set of languages for which at least one user is active, always
 * including en-US and the `general.language` setting. Drives the eager
 * translation fetch pipeline so we only call TMDB for languages someone uses.
 */
export async function getActiveUserLanguages(db: Database): Promise<Set<string>> {
  if (activeUserLanguagesCache && Date.now() - activeUserLanguagesCacheTime < CACHE_TTL_MS) {
    return activeUserLanguagesCache;
  }
  const rows = await db
    .selectDistinct({ language: user.language })
    .from(user)
    .where(isNotNull(user.language));

  const codes = new Set<string>(rows.map((r) => r.language).filter((l): l is string => !!l));
  codes.add("en-US");
  const settingsLang = await getSetting("general.language");
  if (settingsLang) codes.add(settingsLang);

  activeUserLanguagesCache = codes;
  activeUserLanguagesCacheTime = Date.now();
  return activeUserLanguagesCache;
}

/** Bust the active-user-languages cache (call after user.language changes). */
export function invalidateActiveUserLanguages(): void {
  activeUserLanguagesCache = null;
  activeUserLanguagesCacheTime = 0;
}
