import { db } from "@canto/db/client";
import { eq } from "drizzle-orm";
import { userConnection } from "@canto/db/schema";
import { coordinateTraktSync } from "@canto/core/domain/trakt/coordinator";
import {
  runTraktSection,
  type RunSectionInput,
} from "@canto/core/domain/trakt/run-section";
import { makeTraktRepository } from "@canto/core/infra/trakt/trakt-repository.adapter";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";

/**
 * Periodic coordinator. One probe per Trakt connection; per-section work is
 * fanned out to `trakt-sync-section` jobs.
 */
export async function handleTraktSync(): Promise<void> {
  const trakt = makeTraktRepository(db);
  await coordinateTraktSync(db, { trakt }, jobDispatcher);
}

/**
 * User-triggered coordinator. Walks every Trakt connection owned by the
 * user. `force=true` so a freshly-connected account or a manual "resync"
 * dispatches every section regardless of watermarks.
 */
export async function handleTraktSyncUser(userId: string): Promise<void> {
  const trakt = makeTraktRepository(db);
  const connections = await db.query.userConnection.findMany({
    where: eq(userConnection.userId, userId),
  });
  for (const conn of connections) {
    if (conn.provider !== "trakt") continue;
    await coordinateTraktSync(db, { trakt }, jobDispatcher, {
      connectionId: conn.id,
      force: true,
    });
  }
}

/** Section-job worker — one (connection, section) pair per call. */
export async function handleTraktSyncSection(
  input: RunSectionInput,
): Promise<void> {
  const trakt = makeTraktRepository(db);
  await runTraktSection(db, { trakt }, input);
}
