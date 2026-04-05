import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { notification } from "@canto/db/schema";

export async function insertNotification(
  db: Database,
  data: typeof notification.$inferInsert,
) {
  await db.insert(notification).values(data);
}

export async function findNotificationByTypeAndMedia(
  db: Database,
  type: string,
  mediaId: string,
) {
  return db.query.notification.findFirst({
    where: and(eq(notification.type, type), eq(notification.mediaId, mediaId)),
  });
}
