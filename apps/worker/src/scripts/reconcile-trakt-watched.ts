/**
 * One-shot reconciler. Promotes user_media_state.status to "completed" for
 * every (user, media) pair that already has playback rows. Used to backfill
 * users whose Trakt watched data was synced before sync-watched.ts started
 * calling promoteUserMediaStateFromPlayback inline.
 *
 * Usage: pnpm dotenv -e ../../.env -- tsx src/scripts/reconcile-trakt-watched.ts <userId>
 */
import { db } from "@canto/db/client";
import { reconcileStatesFromPlayback } from "@canto/core/domain/user-media/use-cases/reconcile-states-from-playback";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: tsx reconcile-trakt-watched.ts <userId>");
    process.exit(1);
  }
  const result = await reconcileStatesFromPlayback(db, userId);
  console.log(`scanned=${result.scanned} promoted=${result.promoted}`);
  if (result.errors.length > 0) {
    console.warn(`errors (first ${result.errors.length}):`);
    for (const e of result.errors) console.warn(`  - ${e}`);
  }
  process.exit(0);
}

void main();
