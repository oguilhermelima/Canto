import { eq } from "drizzle-orm";

import type { NormalizedMedia } from "@canto/providers";

import { episode, media, season } from "./schema";
import type { Database } from "./client";

/** Persist normalized media + seasons + episodes into the database. */
export async function persistMedia(
  db: Database,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
  const [inserted] = await db
    .insert(media)
    .values({
      type: normalized.type,
      externalId: normalized.externalId,
      provider: normalized.provider,
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
      tvdbId: normalized.tvdbId,
      numberOfSeasons: normalized.numberOfSeasons,
      numberOfEpisodes: normalized.numberOfEpisodes,
      inProduction: normalized.inProduction,
      nextAirDate: normalized.nextAirDate,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
    })
    .returning();

  if (!inserted) throw new Error("Failed to insert media");

  await persistSeasons(db, inserted.id, normalized);
  return inserted;
}

/** Update an existing media record with fresh normalized data. */
export async function updateMediaFromNormalized(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
  const [updated] = await db
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
      tvdbId: normalized.tvdbId,
      numberOfSeasons: normalized.numberOfSeasons,
      numberOfEpisodes: normalized.numberOfEpisodes,
      inProduction: normalized.inProduction,
      nextAirDate: normalized.nextAirDate,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .returning();

  if (!updated) throw new Error("Failed to update media");

  // Re-create seasons + episodes
  if (normalized.type === "show" && normalized.seasons) {
    await db.delete(season).where(eq(season.mediaId, mediaId));
    await persistSeasons(db, mediaId, normalized);
  }

  return updated;
}

async function persistSeasons(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  if (normalized.type !== "show" || !normalized.seasons) return;

  for (const s of normalized.seasons) {
    const [insertedSeason] = await db
      .insert(season)
      .values({
        mediaId,
        number: s.number,
        externalId: s.externalId,
        name: s.name,
        overview: s.overview,
        airDate: s.airDate,
        posterPath: s.posterPath,
        episodeCount: s.episodeCount,
        seasonType: s.seasonType,
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
          absoluteNumber: ep.absoluteNumber,
          finaleType: ep.finaleType,
        })),
      );
    }
  }
}
