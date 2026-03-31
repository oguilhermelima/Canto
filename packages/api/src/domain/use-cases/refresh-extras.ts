import { eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import {
  media,
  mediaCredit,
  mediaVideo,
  mediaWatchProvider,
  recommendationPool,
} from "@canto/db/schema";
import type { MediaType, SearchResult } from "@canto/providers";
import { getTmdbProvider } from "../../lib/tmdb-client";
import { findMediaById } from "../../infrastructure/repositories";

function calculatePoolScore(
  voteAverage: number | undefined,
  voteCount: number | undefined,
  popularity: number | undefined,
  releaseDate: string | null | undefined,
): number {
  // Base: weighted vote (penalize low vote counts — a 10/10 with 1 vote is not trustworthy)
  const avg = voteAverage ?? 0;
  const count = voteCount ?? 0;
  const minVotes = 50;
  const weightedAvg = (count / (count + minVotes)) * avg + (minVotes / (count + minVotes)) * 6;
  let score = weightedAvg * 10;

  // Popularity boost (log scale, capped)
  if (popularity && popularity > 0) {
    score += Math.min(Math.log10(popularity) * 10, 30);
  }

  // Recency boost
  if (releaseDate) {
    const days = (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 30) score += 20;
    else if (days <= 90) score += 10;
    else if (days <= 365) score += 5;
  }

  return Math.round(score * 100) / 100;
}

function mapToPoolRow(
  result: SearchResult,
  sourceMediaId: string,
  sourceType: "similar" | "recommendation",
  trailerKey?: string,
) {
  return {
    tmdbId: result.externalId,
    mediaType: result.type,
    sourceMediaId,
    title: result.title,
    overview: result.overview,
    posterPath: result.posterPath,
    backdropPath: result.backdropPath,
    trailerKey: trailerKey ?? null,
    releaseDate: result.releaseDate,
    voteAverage: result.voteAverage,
    score: calculatePoolScore(result.voteAverage, result.voteCount, result.popularity, result.releaseDate),
    frequency: 1,
    sourceType,
  };
}

export async function refreshExtras(
  db: Database,
  mediaId: string,
): Promise<void> {
  const row = await findMediaById(db, mediaId);
  if (!row) return;

  const provider = await getTmdbProvider();
  const extras = await provider.getExtras(
    row.externalId,
    row.type as MediaType,
  );

  await db.transaction(async (tx) => {
    // Clear existing data for this media
    await tx.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    await tx.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    await tx
      .delete(mediaWatchProvider)
      .where(eq(mediaWatchProvider.mediaId, mediaId));
    await tx
      .delete(recommendationPool)
      .where(eq(recommendationPool.sourceMediaId, mediaId));

    // Insert credits (cast)
    if (extras.credits.cast.length > 0) {
      await tx.insert(mediaCredit).values(
        extras.credits.cast.map((c, i) => ({
          mediaId,
          personId: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profilePath,
          type: "cast" as const,
          order: c.order ?? i,
        })),
      );
    }

    // Insert credits (crew)
    if (extras.credits.crew.length > 0) {
      await tx.insert(mediaCredit).values(
        extras.credits.crew.map((c, i) => ({
          mediaId,
          personId: c.id,
          name: c.name,
          department: c.department,
          job: c.job,
          profilePath: c.profilePath,
          type: "crew" as const,
          order: i,
        })),
      );
    }

    // Insert videos
    if (extras.videos.length > 0) {
      await tx.insert(mediaVideo).values(
        extras.videos.map((v) => ({
          mediaId,
          externalKey: v.key,
          site: v.site,
          name: v.name,
          type: v.type,
          official: v.official,
        })),
      );
    }

    // Insert watch providers (flatten all regions)
    if (extras.watchProviders) {
      const wpRows: Array<{
        mediaId: string;
        providerId: number;
        providerName: string;
        logoPath: string | undefined;
        type: string;
        region: string;
      }> = [];

      for (const [region, data] of Object.entries(extras.watchProviders)) {
        for (const wp of data.flatrate ?? []) {
          wpRows.push({
            mediaId,
            providerId: wp.providerId,
            providerName: wp.providerName,
            logoPath: wp.logoPath,
            type: "stream",
            region,
          });
        }
        for (const wp of data.rent ?? []) {
          wpRows.push({
            mediaId,
            providerId: wp.providerId,
            providerName: wp.providerName,
            logoPath: wp.logoPath,
            type: "rent",
            region,
          });
        }
        for (const wp of data.buy ?? []) {
          wpRows.push({
            mediaId,
            providerId: wp.providerId,
            providerName: wp.providerName,
            logoPath: wp.logoPath,
            type: "buy",
            region,
          });
        }
      }

      if (wpRows.length > 0) {
        await tx.insert(mediaWatchProvider).values(wpRows);
      }
    }

    // Fetch trailers for pool items (best-effort, parallel, top items with backdrops)
    const allPoolItems = [
      ...extras.recommendations.map((r) => ({ result: r, sourceType: "recommendation" as const })),
      ...extras.similar.map((r) => ({ result: r, sourceType: "similar" as const })),
    ];
    const itemsWithBackdrops = allPoolItems.filter((i) => i.result.backdropPath);
    const trailerMap = new Map<number, string>();

    // Fetch trailers in parallel for items with backdrops (max 10 to avoid rate limits)
    const toFetch = itemsWithBackdrops.slice(0, 10);
    if (toFetch.length > 0) {
      const tmdb = await getTmdbProvider();
      await Promise.allSettled(
        toFetch.map(async (item) => {
          try {
            const tmdbType = item.result.type === "show" ? "tv" : "movie";
            const videos = await tmdb.getVideos(item.result.externalId, tmdbType);
            const trailer = videos.find((v) => v.type === "Trailer" && v.site === "YouTube");
            if (trailer) trailerMap.set(item.result.externalId, trailer.key);
          } catch {
            // Best-effort, skip on failure
          }
        }),
      );
    }

    // Build pool rows with trailer keys
    const poolRows = allPoolItems.map((item) =>
      mapToPoolRow(
        item.result,
        mediaId,
        item.sourceType,
        trailerMap.get(item.result.externalId),
      ),
    );

    if (poolRows.length > 0) {
      await tx.insert(recommendationPool).values(poolRows);
    }

    // Update extrasUpdatedAt
    await tx
      .update(media)
      .set({ extrasUpdatedAt: new Date() })
      .where(eq(media.id, mediaId));
  });
}
