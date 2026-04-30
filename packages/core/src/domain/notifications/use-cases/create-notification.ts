import type { NotificationsRepositoryPort } from "../ports/notifications-repository.port";
import type { NewNotification } from "../types/notification";

export interface CreateNotificationDeps {
  repo: NotificationsRepositoryPort;
}

export async function createNotification(
  deps: CreateNotificationDeps,
  input: NewNotification,
): Promise<void> {
  await deps.repo.insert(input);
}
