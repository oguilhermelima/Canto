import type { Database } from "@canto/db/client";
import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import {
  findNotificationByTypeAndMedia,
  insertNotification,
} from "@canto/core/infra/notifications/notification-repository";
import { toDomain, toRow } from "@canto/core/infra/notifications/notification.mapper";

export function makeNotificationsRepository(
  db: Database,
): NotificationsRepositoryPort {
  return {
    insert: async (input) => {
      await insertNotification(db, toRow(input));
    },
    findByTypeAndMedia: async (type, mediaId) => {
      const row = await findNotificationByTypeAndMedia(db, type, mediaId);
      return row ? toDomain(row) : null;
    },
  };
}
