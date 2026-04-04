import { eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userPreference } from "@canto/db/schema";

/**
 * @deprecated Library functions moved to folder-repository.ts.
 * This file only retains user preference functions.
 */

export async function findUserPreferences(db: Database, userId: string) {
  const rows = await db.query.userPreference.findMany({
    where: eq(userPreference.userId, userId),
  });
  const prefs: Record<string, unknown> = {};
  for (const row of rows) prefs[row.key] = row.value;
  return { autoMergeVersions: true, defaultQuality: "fullhd", ...prefs };
}

export async function upsertUserPreference(
  db: Database,
  userId: string,
  key: string,
  value: unknown,
) {
  await db
    .insert(userPreference)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [userPreference.userId, userPreference.key],
      set: { value },
    });
}
