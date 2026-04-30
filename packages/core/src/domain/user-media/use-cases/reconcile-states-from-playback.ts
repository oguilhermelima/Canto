import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { promoteUserMediaStateFromPlayback } from "@canto/core/domain/user-media/use-cases/promote-user-media-state-from-playback";

export interface ReconcileStatesFromPlaybackDeps {
  repo: UserMediaRepositoryPort;
  mediaRepo: MediaRepositoryPort;
}

export interface ReconcileStatesFromPlaybackResult {
  scanned: number;
  promoted: number;
  errors: string[];
}

export async function reconcileStatesFromPlayback(
  deps: ReconcileStatesFromPlaybackDeps,
  userId: string,
): Promise<ReconcileStatesFromPlaybackResult> {
  const pairs = await deps.repo.findDistinctPlaybackMediaPairs(userId);

  let promoted = 0;
  const errors: string[] = [];
  for (const pair of pairs) {
    try {
      const result = await promoteUserMediaStateFromPlayback(deps, {
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
