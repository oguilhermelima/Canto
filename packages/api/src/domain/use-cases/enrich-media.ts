import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { getSupportedLanguageCodes, updateMediaFromNormalized } from "@canto/db/persist-media";
import { SETTINGS } from "../../lib/settings-keys";
import { findMediaById, updateMedia } from "../../infrastructure/repositories/media-repository";
import { refreshExtras } from "./refresh-extras";
import { reconcileShowStructure } from "./reconcile-show-structure";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { JobDispatcherPort } from "../ports/job-dispatcher.port";

export async function enrichMedia(
  db: Database,
  mediaId: string,
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort; dispatcher: JobDispatcherPort; full?: boolean },
): Promise<void> {
  const row = await findMediaById(db, mediaId);
  if (!row) return;

  // Stage 1: Full metadata (if not yet fetched)
  if (!row.metadataUpdatedAt) {
    try {
      const supportedLangs = [...await getSupportedLanguageCodes(db)];
      const provider = row.provider === "tvdb" ? deps.tvdb : deps.tmdb;
      const normalized = await provider.getMetadata(row.externalId, row.type as "movie" | "show", { supportedLanguages: supportedLangs });
      await updateMediaFromNormalized(db, mediaId, normalized);
      await updateMedia(db, mediaId, { processingStatus: "metadata" });
    } catch (err) {
      console.error(`[enrich-media] Stage 1 failed for ${mediaId}:`, err instanceof Error ? err.message : err);
      return; // Don't proceed if metadata fails
    }
  }

  // Stage 2: Extras — credits, videos, watch providers, recommendations (if full pipeline)
  if (deps.full !== false) {
    // Re-read to get updated data from Stage 1
    const updated = await findMediaById(db, mediaId);
    if (updated && !updated.extrasUpdatedAt) {
      try {
        await refreshExtras(db, mediaId, { tmdb: deps.tmdb });
        await updateMedia(db, mediaId, { processingStatus: "enriched" });
      } catch (err) {
        console.error(`[enrich-media] Stage 2 failed for ${mediaId}:`, err instanceof Error ? err.message : err);
      }
    }

    // Stage 3: TVDB reconcile (shows only, if toggle enabled)
    const tvdbEnabled = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;
    if (tvdbEnabled && (updated?.type ?? row.type) === "show") {
      try {
        await reconcileShowStructure(db, mediaId, { tmdb: deps.tmdb, tvdb: deps.tvdb, dispatcher: deps.dispatcher });
      } catch (err) {
        console.error(`[enrich-media] Stage 3 failed for ${mediaId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  await updateMedia(db, mediaId, { processingStatus: "ready" });
  console.log(`[enrich-media] ${mediaId} → ready`);
}
