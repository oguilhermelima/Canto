import { getSetting } from "@canto/db/settings";

import { MS_PER_MINUTE } from "@canto/core/domain/shared/constants";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";

export interface UserPreferencesServiceDeps {
  userPrefs: UserPreferencesPort;
}

/** Resolve user's preferred language (defaults to en-US) */
export async function getUserLanguage(
  deps: UserPreferencesServiceDeps,
  userId: string,
): Promise<string> {
  const lang = await deps.userPrefs.findUserLanguage(userId);
  return lang ?? "en-US";
}

/**
 * Resolve the user's watch region + language together. Used by discovery
 * procedures (spotlight, top10, genre tiles) that need both to key caches.
 */
export async function getUserWatchPreferences(
  deps: UserPreferencesServiceDeps,
  userId: string,
): Promise<{ language: string; watchRegion: string }> {
  const prefs = await deps.userPrefs.findUserWatchPreferences(userId);
  return {
    language: prefs?.language ?? "en-US",
    watchRegion: prefs?.watchRegion ?? "US",
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
export async function getActiveUserLanguages(
  deps: UserPreferencesServiceDeps,
): Promise<Set<string>> {
  if (
    activeUserLanguagesCache &&
    Date.now() - activeUserLanguagesCacheTime < CACHE_TTL_MS
  ) {
    return activeUserLanguagesCache;
  }
  const codes = new Set<string>(await deps.userPrefs.listActiveUserLanguages());
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
