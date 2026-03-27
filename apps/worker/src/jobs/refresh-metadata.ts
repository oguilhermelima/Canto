import { eq } from "drizzle-orm";

import { db } from "@canto/db/client";
import { episode, media, season } from "@canto/db/schema";
import { getProvider } from "@canto/providers";
import type { ProviderName, MediaType } from "@canto/providers";

/* -------------------------------------------------------------------------- */
/*  Main handler                                                              */
/* -------------------------------------------------------------------------- */

export async function handleRefreshMetadata(): Promise<void> {
  // Fetch all in-library media items
  const items = await db.query.media.findMany({
    where: eq(media.inLibrary, true),
  });

  console.log(
    `[refresh-metadata] Refreshing metadata for ${items.length} library items`,
  );

  let successCount = 0;
  let errorCount = 0;

  for (const item of items) {
    try {
      const provider = getProvider(item.provider as ProviderName);
      const normalized = await provider.getMetadata(
        item.externalId,
        item.type as MediaType,
      );

      // Update the media record
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
        // Delete existing seasons (cascades to episodes)
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
              s.episodes.map((ep) => ({
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

      successCount++;
    } catch (err) {
      errorCount++;
      console.error(
        `[refresh-metadata] Failed to refresh "${item.title}" (${item.id}):`,
        err,
      );
    }
  }

  console.log(
    `[refresh-metadata] Done. Success: ${successCount}, Errors: ${errorCount}`,
  );
}
