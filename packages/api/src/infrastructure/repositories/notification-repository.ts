import type { Database } from "@canto/db/client";
import { notification } from "@canto/db/schema";

export async function insertNotification(
  db: Database,
  data: typeof notification.$inferInsert,
) {
  await db.insert(notification).values(data);
}
