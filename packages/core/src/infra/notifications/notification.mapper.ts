import type { notification } from "@canto/db/schema";
import type {
  NewNotification,
  Notification,
  NotificationId,
  NotificationType,
} from "@canto/core/domain/notifications/types/notification";

type NotificationRow = typeof notification.$inferSelect;
type NotificationInsert = typeof notification.$inferInsert;

export function toDomain(row: NotificationRow): Notification {
  return {
    id: row.id as NotificationId,
    title: row.title,
    message: row.message,
    type: row.type as NotificationType,
    read: row.read,
    mediaId: row.mediaId,
    createdAt: row.createdAt,
  };
}

export function toRow(input: NewNotification): NotificationInsert {
  return {
    title: input.title,
    message: input.message,
    type: input.type,
    mediaId: input.mediaId,
  };
}
