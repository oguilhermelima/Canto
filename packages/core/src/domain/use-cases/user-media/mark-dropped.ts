import type { Database } from "@canto/db/client";
import { logAndSwallow } from "../../../lib/log-error";
import { upsertUserMediaState } from "../../../infrastructure/repositories";
import {
  getUserMediaState,
  type UserMediaStateResponse,
} from "./get-user-media-state";
import { pushWatchStateToServers } from "./push-watch-state";

export interface MarkDroppedResult {
  success: true;
  state: UserMediaStateResponse;
}

export async function markDropped(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<MarkDroppedResult> {
  await upsertUserMediaState(db, { userId, mediaId, status: "dropped" });

  void pushWatchStateToServers(db, userId, mediaId, false).catch(
    logAndSwallow("userMedia.markDropped:pushWatchStateToServers"),
  );

  const state = await getUserMediaState(db, userId, mediaId);
  return { success: true, state };
}
