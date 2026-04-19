import { eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, mediaRecommendation, user } from "@canto/db/schema";
import { updateMediaFromNormalized } from "./persist-media";
import { getActiveUserLanguages } from "../services/user-service";
import type { MediaType } from "@canto/providers";
import { refreshExtras } from "./refresh-extras";
import { rebuildUserRecs } from "./rebuild-user-recs";
import type { MediaProviderPort } from "../ports/media-provider.port";

/**
 * Refresh all media metadata + recommendation items + user recs in the configured language.
 * Used when the language setting changes. Runs sequentially to avoid API rate limits.
 */
export async function refreshAllLanguage(
  db: Database,
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
): Promise<void> {
  // 1. Refresh all media metadata (titles, overviews, posters, logos, backdrops)
  const supportedLangs = [...await getActiveUserLanguages(db)];
  const allMedia = await db.query.media.findMany({
    columns: { id: true, externalId: true, provider: true, type: true },
  });

  console.log(`[refresh-all-language] Refreshing metadata for ${allMedia.length} media items...`);

  let mediaSuccess = 0;
  for (let i = 0; i < allMedia.length; i += 5) {
    const batch = allMedia.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const provider =
            item.provider === "tvdb"
              ? deps.tvdb
              : deps.tmdb;
          const normalized = await provider.getMetadata(
            item.externalId,
            item.type as MediaType,
            { supportedLanguages: supportedLangs },
          );
          await updateMediaFromNormalized(db, item.id, normalized);
          mediaSuccess++;
        } catch {
          // Skip failed items
        }
      }),
    );
  }

  console.log(`[refresh-all-language] Media: ${mediaSuccess}/${allMedia.length} updated`);

  // 2. Refresh all recommendation sources (credits, trailers, logos, recommendations)
  const recSources = await db
    .selectDistinct({ sourceMediaId: mediaRecommendation.sourceMediaId })
    .from(mediaRecommendation);

  console.log(`[refresh-all-language] Refreshing extras for ${recSources.length} recommendation sources...`);

  let extrasSuccess = 0;
  for (const source of recSources) {
    try {
      await refreshExtras(db, source.sourceMediaId, { tmdb: deps.tmdb });
      extrasSuccess++;
    } catch {
      // Skip failed sources
    }
  }

  console.log(`[refresh-all-language] Extras: ${extrasSuccess}/${recSources.length} updated`);

  // 3. Rebuild user recs
  const allUsers = await db.query.user.findMany({
    columns: { id: true },
  });

  console.log(`[refresh-all-language] Rebuilding recs for ${allUsers.length} users...`);

  for (const u of allUsers) {
    try {
      await rebuildUserRecs(db, u.id);
    } catch {
      // Skip failed users
    }
  }

  console.log(`[refresh-all-language] Done.`);
}
