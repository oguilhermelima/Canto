import { asc, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { supportedLanguage, user } from "@canto/db/schema";

export async function findEnabledSupportedLanguages(db: Database) {
  return db.query.supportedLanguage.findMany({
    where: eq(supportedLanguage.enabled, true),
    orderBy: [asc(supportedLanguage.name)],
  });
}

export async function findSupportedLanguage(db: Database, code: string) {
  return db.query.supportedLanguage.findFirst({
    where: eq(supportedLanguage.code, code),
  });
}

export async function updateUserLanguage(
  db: Database,
  userId: string,
  language: string,
): Promise<void> {
  await db.update(user).set({ language }).where(eq(user.id, userId));
}
