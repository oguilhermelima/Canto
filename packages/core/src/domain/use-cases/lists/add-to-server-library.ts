import type { Database } from "@canto/db/client";
import {
  addListItem,
  ensureServerLibrary,
} from "../../../infrastructure/repositories/lists/list";

export async function addMediaToServerLibrary(db: Database, mediaId: string) {
  const serverLib = await ensureServerLibrary(db);
  return addListItem(db, { listId: serverLib.id, mediaId });
}
