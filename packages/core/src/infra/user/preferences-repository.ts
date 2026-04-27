import { z } from "zod";
import { and, eq, like } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userPreference } from "@canto/db/schema";
import {
  EMPTY_DOWNLOAD_PREFERENCES,
  type Av1Stance,
  type DownloadPreferences,
} from "@canto/core/domain/shared/rules/scoring-rules";

/**
 * Strongly-typed userPreference keys for the download flow. Keep new keys
 * under the `download.` prefix so the reader below can fetch them in one
 * round-trip via a key-prefix LIKE query.
 */
export const DOWNLOAD_PREFERENCE_KEYS = {
  preferredLanguages: "download.preferredLanguages",
  preferredStreamingServices: "download.preferredStreamingServices",
  preferredEditions: "download.preferredEditions",
  avoidedEditions: "download.avoidedEditions",
  av1Stance: "download.av1Stance",
} as const;

const stringArray = z.array(z.string());
const av1StanceSchema = z.enum(["neutral", "prefer", "avoid"]);

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
    if (row.key === DOWNLOAD_PREFERENCE_KEYS.av1Stance) {
      const parsed = av1StanceSchema.safeParse(row.value);
      if (parsed.success) prefs.av1Stance = parsed.data;
      continue;
    }

    const parsed = stringArray.safeParse(row.value);
    if (!parsed.success) continue;

    switch (row.key) {
      case DOWNLOAD_PREFERENCE_KEYS.preferredLanguages:
        prefs.preferredLanguages = parsed.data;
        break;
      case DOWNLOAD_PREFERENCE_KEYS.preferredStreamingServices:
        prefs.preferredStreamingServices = parsed.data;
        break;
      case DOWNLOAD_PREFERENCE_KEYS.preferredEditions:
        prefs.preferredEditions = parsed.data;
        break;
      case DOWNLOAD_PREFERENCE_KEYS.avoidedEditions:
        prefs.avoidedEditions = parsed.data;
        break;
    }
  }

  return prefs;
}

/**
 * Persist a single string-array download preference. Phase 4's settings
 * UI calls this through a tRPC procedure; for now it's also useful for
 * tests.
 */
export async function upsertDownloadPreference(
  db: Database,
  userId: string,
  key: Exclude<keyof typeof DOWNLOAD_PREFERENCE_KEYS, "av1Stance">,
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

/** Persist the AV1 stance scalar. Separate from the array writer because
 *  it's a single enum value, not a list. */
export async function upsertAv1Stance(
  db: Database,
  userId: string,
  value: Av1Stance,
): Promise<void> {
  await db
    .insert(userPreference)
    .values({
      userId,
      key: DOWNLOAD_PREFERENCE_KEYS.av1Stance,
      value,
    })
    .onConflictDoUpdate({
      target: [userPreference.userId, userPreference.key],
      set: { value },
    });
}
