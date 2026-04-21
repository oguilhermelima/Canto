import type { Database } from "@canto/db/client";
import { findDistinctPlaybackMediaPairs } from "../../../infrastructure/repositories";
import { promoteUserMediaStateFromPlayback } from "./promote-user-media-state-from-playback";

export interface ReconcileStatesFromPlaybackResult {
  scanned: number;
  promoted: number;
  errors: string[];
}

export async function reconcileStatesFromPlayback(
  db: Database,
  userId: string,
): Promise<ReconcileStatesFromPlaybackResult> {
  const pairs = await findDistinctPlaybackMediaPairs(db, userId);

  let promoted = 0;
  const errors: string[] = [];
  for (const pair of pairs) {
    try {
      const result = await promoteUserMediaStateFromPlayback(db, {
        userId: pair.userId,
        mediaId: pair.mediaId,
      });
      if (result) promoted++;
    } catch (err) {
      errors.push(
        `${pair.mediaId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { scanned: pairs.length, promoted, errors: errors.slice(0, 10) };
}
