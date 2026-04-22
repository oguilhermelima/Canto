import type { Database } from "@canto/db/client";
import { insertNotification } from "../../../infra/repositories";

type NotificationType =
  | "import_success"
  | "import_failed"
  | "import_warning"
  | "cross_filesystem_warning"
  | "download_failed"
  | "download_stalled"
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
  await insertNotification(db, {
    title: input.title,
    message: input.message,
    type: input.type,
    mediaId: input.mediaId ?? null,
  });
}
