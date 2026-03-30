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
  releaseDate: string | null | undefined,
): number {
  let score = (voteAverage ?? 0) * 10;
  if (releaseDate) {
    const days =
      (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 30) score += 50;
    else if (days <= 90) score += 30;
    else if (days <= 365) score += 10;
  }
  return Math.round(score * 100) / 100;
}

function mapToPoolRow(
  result: SearchResult,
  sourceMediaId: string,
  sourceType: "similar" | "recommendation",
): {
  tmdbId: number;
  mediaType: string;
  sourceMediaId: string;
  title: string;
  overview: string | undefined;
  posterPath: string | undefined;
  backdropPath: string | undefined;
  releaseDate: string | undefined;
  voteAverage: number | undefined;
  score: number;
  frequency: number;
  sourceType: string;
} {
  return {
    tmdbId: result.externalId,
    mediaType: result.type,
    sourceMediaId,
    title: result.title,
    overview: result.overview,
    posterPath: result.posterPath,
    backdropPath: result.backdropPath,
    releaseDate: result.releaseDate,
    voteAverage: result.voteAverage,
    score: calculatePoolScore(result.voteAverage, result.releaseDate),
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

    // Insert recommendation pool (recommendations + similar)
    const poolRows = [
      ...extras.recommendations.map((r) =>
        mapToPoolRow(r, mediaId, "recommendation"),
      ),
      ...extras.similar.map((r) => mapToPoolRow(r, mediaId, "similar")),
    ];

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
