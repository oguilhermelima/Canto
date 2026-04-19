import { eq, isNotNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { user } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";

/** Resolve user's preferred language (defaults to en-US) */
export async function getUserLanguage(db: Database, userId: string): Promise<string> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { language: true },
  });
  return row?.language ?? "en-US";
}

let activeUserLanguagesCache: Set<string> | null = null;
let activeUserLanguagesCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
