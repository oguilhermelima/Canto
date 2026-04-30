import { db } from "@canto/db/client";
import { eq } from "drizzle-orm";
import { userConnection } from "@canto/db/schema";
import { coordinateTraktSync } from "@canto/core/domain/trakt/coordinator";
import {
  runTraktSection
  
  
} from "@canto/core/domain/trakt/run-section";
import type {RunSectionInput, RunTraktSectionDeps} from "@canto/core/domain/trakt/run-section";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeUserConnectionRepository } from "@canto/core/infra/media-servers/user-connection-repository.adapter";
import { makeTraktApi } from "@canto/core/infra/trakt/trakt-api.adapter-bindings";
import { makeTraktRepository } from "@canto/core/infra/trakt/trakt-repository.adapter";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";

async function buildSectionDeps(): Promise<RunTraktSectionDeps> {
  const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
  return {
    traktApi: makeTraktApi(),
    trakt: makeTraktRepository(db),
    userConnection: makeUserConnectionRepository(db),
    userMedia: makeUserMediaRepository(db),
    lists: makeListsRepository(db),
    media: makeMediaRepository(db),
    providers: { tmdb, tvdb },
  };
}

/**
 * Periodic coordinator. One probe per Trakt connection; per-section work is
 * fanned out to `trakt-sync-section` jobs.
 */
export async function handleTraktSync(): Promise<void> {
  await coordinateTraktSync(
    db,
    {
      traktApi: makeTraktApi(),
      trakt: makeTraktRepository(db),
      userConnection: makeUserConnectionRepository(db),
    },
    jobDispatcher,
  );
}

/**
 * User-triggered coordinator. Walks every Trakt connection owned by the
 * user. `force=true` so a freshly-connected account or a manual "resync"
 * dispatches every section regardless of watermarks.
 */
export async function handleTraktSyncUser(userId: string): Promise<void> {
  const deps = {
    traktApi: makeTraktApi(),
    trakt: makeTraktRepository(db),
    userConnection: makeUserConnectionRepository(db),
  };
  const connections = await db.query.userConnection.findMany({
    where: eq(userConnection.userId, userId),
  });
  for (const conn of connections) {
    if (conn.provider !== "trakt") continue;
    await coordinateTraktSync(db, deps, jobDispatcher, {
      connectionId: conn.id,
      force: true,
    });
  }
}

/** Section-job worker — one (connection, section) pair per call. */
export async function handleTraktSyncSection(
  input: RunSectionInput,
): Promise<void> {
  const deps = await buildSectionDeps();
  await runTraktSection(db, deps, input);
}
