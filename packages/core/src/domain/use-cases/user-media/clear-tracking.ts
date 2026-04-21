import type { Database } from "@canto/db/client";
import { logAndSwallow } from "../../../lib/log-error";
import { upsertUserMediaState } from "../../../infrastructure/repositories";
import {
  getUserMediaState,
  type UserMediaStateResponse,
} from "./get-user-media-state";
import { pushWatchStateToServers } from "./push-watch-state";

export interface ClearTrackingResult {
  success: true;
  state: UserMediaStateResponse;
}

export async function clearTracking(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<ClearTrackingResult> {
  await upsertUserMediaState(db, { userId, mediaId, status: "none" });

  void pushWatchStateToServers(db, userId, mediaId, false).catch(
    logAndSwallow("userMedia.clearTracking:pushWatchStateToServers"),
  );

  const state = await getUserMediaState(db, userId, mediaId);
  return { success: true, state };
}
