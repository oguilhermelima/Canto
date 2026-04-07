import type { notification } from "@canto/db/schema";

type NotificationRow = typeof notification.$inferSelect;
type NotificationInsert = typeof notification.$inferInsert;

export interface NotificationRepositoryPort {
  insertNotification(data: NotificationInsert): Promise<void>;
  findNotificationByTypeAndMedia(
    type: string,
    mediaId: string,
  ): Promise<NotificationRow | undefined>;
}
