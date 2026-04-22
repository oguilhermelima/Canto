import type { Database } from "@canto/db/client";
import { reconcileShowStructure } from "./reconcile-show-structure";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import type { JobDispatcherPort } from "../../shared/ports/job-dispatcher.port";

export async function replaceShowWithTvdb(
  db: Database,
  mediaId: string,
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort; dispatcher: JobDispatcherPort },
): Promise<void> {
  try {
    await reconcileShowStructure(db, mediaId, deps);
  } catch (err) {
    console.warn(
      `[reconcile-show] Failed for mediaId ${mediaId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
