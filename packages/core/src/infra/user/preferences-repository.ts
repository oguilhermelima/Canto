import { z } from "zod";
import { and, eq, like } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userPreference } from "@canto/db/schema";
import {
  EMPTY_DOWNLOAD_PREFERENCES
  
} from "@canto/core/domain/shared/rules/scoring-rules";
import type {DownloadPreferences} from "@canto/core/domain/shared/rules/scoring-rules";

/**
 * Strongly-typed userPreference keys for the per-user download flow.
 * Edition policy and AV1 stance moved to `download_config` (admin-wide
 * policy); only personal-taste keys remain here.
 */
export const DOWNLOAD_PREFERENCE_KEYS = {
  preferredLanguages: "download.preferredLanguages",
  preferredStreamingServices: "download.preferredStreamingServices",
} as const;

const stringArray = z.array(z.string());

/**
 * Read every download.* preference for a user and decode them into the
 * typed {@link DownloadPreferences} shape consumed by the scoring engine.
 *
 * Missing or malformed rows fall back to the empty preference set — we
 * trust the writer to keep values valid, but never let bad data block a
 * search.
 */
export async function findDownloadPreferences(
  db: Database,
  userId: string,
): Promise<DownloadPreferences> {
  const rows = await db.query.userPreference.findMany({
    where: and(
      eq(userPreference.userId, userId),
      like(userPreference.key, "download.%"),
    ),
  });

  const prefs: DownloadPreferences = { ...EMPTY_DOWNLOAD_PREFERENCES };

  for (const row of rows) {
    const parsed = stringArray.safeParse(row.value);
    if (!parsed.success) continue;

    switch (row.key) {
      case DOWNLOAD_PREFERENCE_KEYS.preferredLanguages:
        prefs.preferredLanguages = parsed.data;
        break;
      case DOWNLOAD_PREFERENCE_KEYS.preferredStreamingServices:
        prefs.preferredStreamingServices = parsed.data;
        break;
    }
  }

  return prefs;
}

/**
 * Persist a single string-array download preference. The settings UI
 * calls this through a tRPC procedure; tests use it for fixture setup.
 */
export async function upsertDownloadPreference(
  db: Database,
  userId: string,
  key: keyof typeof DOWNLOAD_PREFERENCE_KEYS,
  value: string[],
): Promise<void> {
  await db
    .insert(userPreference)
    .values({
      userId,
      key: DOWNLOAD_PREFERENCE_KEYS[key],
      value,
    })
    .onConflictDoUpdate({
      target: [userPreference.userId, userPreference.key],
      set: { value },
    });
}
