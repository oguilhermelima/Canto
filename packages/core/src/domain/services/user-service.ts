import { eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { user } from "@canto/db/schema";

/** Resolve user's preferred language (defaults to en-US) */
export async function getUserLanguage(db: Database, userId: string): Promise<string> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { language: true },
  });
  return row?.language ?? "en-US";
}
