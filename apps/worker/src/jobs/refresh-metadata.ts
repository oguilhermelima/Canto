import { eq } from "drizzle-orm";

import { db } from "@canto/db/client";
import { episode, media, season } from "@canto/db/schema";
import { getProvider } from "@canto/providers";
import type { MediaType, NormalizedEpisode, ProviderName } from "@canto/providers";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Number of items to process before pausing for a rate-limit delay. */
const BATCH_SIZE = 10;

/** Milliseconds to wait between batches to avoid API rate limits. */
const BATCH_DELAY_MS = 2_000;

/** Milliseconds to wait between individual items within a batch. */
const ITEM_DELAY_MS = 250;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                              */
/* -------------------------------------------------------------------------- */

export async function handleRefreshMetadata(): Promise<void> {
  // Fetch all in-library media items
  const items = await db.query.media.findMany({
    where: eq(media.inLibrary, true),
  });

  if (items.length === 0) {
    console.log("[refresh-metadata] No library items to refresh");
    return;
  }

  console.log(
    `[refresh-metadata] Refreshing metadata for ${items.length} library item(s) in batches of ${BATCH_SIZE}`,
  );

  let successCount = 0;
  let errorCount = 0;

  // Process in batches to respect API rate limits
  for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
    const batch = items.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    console.log(
      `[refresh-metadata] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`,
    );

    for (const item of batch) {
      try {
        await refreshSingleItem(item);
        successCount++;
      } catch (err) {
        errorCount++;
        console.error(
          `[refresh-metadata] Failed to refresh "${item.title}" (${item.id}):`,
          err instanceof Error ? err.message : err,
        );
      }

      // Small delay between individual items
      if (ITEM_DELAY_MS > 0) {
        await sleep(ITEM_DELAY_MS);
      }
    }

    // Larger delay between batches (skip after last batch)
    if (batchStart + BATCH_SIZE < items.length && BATCH_DELAY_MS > 0) {
      console.log(
        `[refresh-metadata] Waiting ${BATCH_DELAY_MS}ms before next batch...`,
      );
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `[refresh-metadata] Done. Success: ${successCount}, Errors: ${errorCount}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  Single item refresh                                                       */
/* -------------------------------------------------------------------------- */

async function refreshSingleItem(item: {
  id: string;
  title: string;
  provider: string;
  externalId: number;
  type: string;
}): Promise<void> {
  const provider = await getProvider(item.provider as ProviderName);
  const normalized = await provider.getMetadata(
    item.externalId,
    item.type as MediaType,
  );

  // Update the media record with fresh metadata
  await db
    .update(media)
    .set({
      title: normalized.title,
      originalTitle: normalized.originalTitle,
      overview: normalized.overview,
      tagline: normalized.tagline,
      releaseDate: normalized.releaseDate,
      year: normalized.year,
      lastAirDate: normalized.lastAirDate,
      status: normalized.status,
      genres: normalized.genres,
      contentRating: normalized.contentRating,
      originalLanguage: normalized.originalLanguage,
      spokenLanguages: normalized.spokenLanguages,
      originCountry: normalized.originCountry,
      voteAverage: normalized.voteAverage,
      voteCount: normalized.voteCount,
      popularity: normalized.popularity,
      runtime: normalized.runtime,
      posterPath: normalized.posterPath,
      backdropPath: normalized.backdropPath,
      logoPath: normalized.logoPath,
      imdbId: normalized.imdbId,
      numberOfSeasons: normalized.numberOfSeasons,
      numberOfEpisodes: normalized.numberOfEpisodes,
      inProduction: normalized.inProduction,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(media.id, item.id));

  // For shows, refresh seasons and episodes
  if (normalized.type === "show" && normalized.seasons) {
    // Delete existing seasons (cascades to episodes via foreign key)
    await db.delete(season).where(eq(season.mediaId, item.id));

    for (const s of normalized.seasons) {
      const [insertedSeason] = await db
        .insert(season)
        .values({
          mediaId: item.id,
          number: s.number,
          externalId: s.externalId,
          name: s.name,
          overview: s.overview,
          airDate: s.airDate,
          posterPath: s.posterPath,
          episodeCount: s.episodeCount,
        })
        .returning();

      if (insertedSeason && s.episodes && s.episodes.length > 0) {
        await db.insert(episode).values(
          s.episodes.map((ep: NormalizedEpisode) => ({
            seasonId: insertedSeason.id,
            number: ep.number,
            externalId: ep.externalId,
            title: ep.title,
            overview: ep.overview,
            airDate: ep.airDate,
            runtime: ep.runtime,
            stillPath: ep.stillPath,
            voteAverage: ep.voteAverage,
          })),
        );
      }
    }
  }

  console.log(`[refresh-metadata] Refreshed "${item.title}"`);
}
