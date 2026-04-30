import type {
  NewNotification,
  Notification,
  NotificationType,
} from "../types/notification";

export interface NotificationsRepositoryPort {
  insert(input: NewNotification): Promise<void>;
  findByTypeAndMedia(
    type: NotificationType,
    mediaId: string,
  ): Promise<Notification | null>;
}
