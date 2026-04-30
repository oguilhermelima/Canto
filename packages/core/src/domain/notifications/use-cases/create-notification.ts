import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import type { NewNotification } from "@canto/core/domain/notifications/types/notification";

export interface CreateNotificationDeps {
  repo: NotificationsRepositoryPort;
}

export async function createNotification(
  deps: CreateNotificationDeps,
  input: NewNotification,
): Promise<void> {
  await deps.repo.insert(input);
}
