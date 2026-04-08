import type { Database } from "@canto/db/client";
import { getSupportedLanguageCodes, updateMediaFromNormalized } from "@canto/db/persist-media";
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

  const isShow = row.type === "show";
  const needsMetadata = !row.metadataUpdatedAt;
  const needsExtras = deps.full !== false && !row.extrasUpdatedAt;

  if (deps.full === false) {
    // Light enrichment — metadata only, no extras or TVDB
    if (needsMetadata) {
      try {
        const supportedLangs = [...await getSupportedLanguageCodes(db)];
        const provider = row.provider === "tvdb" ? deps.tvdb : deps.tmdb;
        const normalized = await provider.getMetadata(row.externalId, row.type as "movie" | "show", { supportedLanguages: supportedLangs });
        await updateMediaFromNormalized(db, mediaId, normalized);
      } catch (err) {
        console.error(`[enrich-media] Metadata failed for ${mediaId}:`, err instanceof Error ? err.message : err);
        return;
      }
    }
    await updateMedia(db, mediaId, { processingStatus: "ready" });
    console.log(`[enrich-media] ${mediaId} → ready`);
    return;
  }

  // Full enrichment — run metadata + extras in parallel, then TVDB reconcile
  const parallel: Promise<void>[] = [];

  // Metadata fetch (TMDB or TVDB depending on provider)
  let metadataOk = !needsMetadata; // already done if not needed
  if (needsMetadata) {
    parallel.push(
      (async () => {
        const supportedLangs = [...await getSupportedLanguageCodes(db)];
        const provider = row.provider === "tvdb" ? deps.tvdb : deps.tmdb;
        const normalized = await provider.getMetadata(row.externalId, row.type as "movie" | "show", { supportedLanguages: supportedLangs });
        await updateMediaFromNormalized(db, mediaId, normalized);
        metadataOk = true;
      })().catch((err) => {
        console.error(`[enrich-media] Metadata failed for ${mediaId}:`, err instanceof Error ? err.message : err);
      }),
    );
  }

  // Extras — credits, videos, watch providers, recommendations (uses externalId from persist, no dependency on metadata)
  if (needsExtras) {
    parallel.push(
      refreshExtras(db, mediaId, { tmdb: deps.tmdb })
        .catch((err) => {
          console.error(`[enrich-media] Extras failed for ${mediaId}:`, err instanceof Error ? err.message : err);
        }),
    );
  }

  // Wait for metadata + extras to complete
  if (parallel.length > 0) {
    await Promise.allSettled(parallel);
  }

  if (!metadataOk) {
    // Metadata failed — can't proceed to TVDB or mark as ready
    return;
  }

  // TVDB reconcile — needs tvdbId/imdbId from metadata, so runs after metadata completes
  // reconcileShowStructure internally checks per-media override + global setting
  if (isShow) {
    try {
      await reconcileShowStructure(db, mediaId, { tmdb: deps.tmdb, tvdb: deps.tvdb, dispatcher: deps.dispatcher });
    } catch (err) {
      console.error(`[enrich-media] TVDB reconcile failed for ${mediaId}:`, err instanceof Error ? err.message : err);
    }
  }

  await updateMedia(db, mediaId, { processingStatus: "ready" });
  console.log(`[enrich-media] ${mediaId} → ready`);
}
