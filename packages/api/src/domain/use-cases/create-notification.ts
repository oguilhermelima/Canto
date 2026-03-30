import type { Database } from "@canto/db/client";
import { notification } from "@canto/db/schema";

type NotificationType =
  | "import_success"
  | "import_failed"
  | "download_failed"
  | "blocklist_added"
  | "movie_multi_file";

export async function createNotification(
  db: Database,
  input: {
    title: string;
    message: string;
    type: NotificationType;
    mediaId?: string;
  },
): Promise<void> {
  await db.insert(notification).values({
    title: input.title,
    message: input.message,
    type: input.type,
    mediaId: input.mediaId ?? null,
  });
}
