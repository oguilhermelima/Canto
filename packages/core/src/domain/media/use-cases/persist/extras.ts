import { and, eq, inArray } from "drizzle-orm";

import type { MediaExtras } from "@canto/providers";
import {
  media,
  mediaCredit,
  mediaRecommendation,
  mediaVideo,
  mediaWatchProvider,
} from "@canto/db/schema";
import type { Database } from "@canto/db/client";

import { logAndSwallow } from "../../../../platform/logger/log-error";
import { dispatchEnsureMedia } from "../../../../platform/queue/bullmq-dispatcher";

/**
 * Persist media extras (credits, videos, watch providers, recommendations).
 * Handles delete + re-insert for simple tables and diff-based updates for
 * recommendation junctions.
 */
export async function persistExtras(
  db: Database,
  mediaId: string,
  extras: MediaExtras,
): Promise<void> {
  // Each similar/recommendation needs a media row to link to via the junction
  // table. Stub rows (no metadataUpdatedAt) trigger a full fetch on visit.

  const allRecItems = [
    ...extras.similar.map((r) => ({ result: r, sourceType: "similar" as const })),
    ...extras.recommendations.map((r) => ({ result: r, sourceType: "recommendation" as const })),
  ];

  const uniqueItems = new Map<string, (typeof allRecItems)[number]>();
  for (const item of allRecItems) {
    const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
    if (!uniqueItems.has(key)) uniqueItems.set(key, item);
  }

  const recMediaIdByKey = new Map<string, string>();

  if (uniqueItems.size > 0) {
    const extIds = [...uniqueItems.values()].map((i) => i.result.externalId);
    const existingRows = await db.query.media.findMany({
      where: and(
        inArray(media.externalId, extIds),
        eq(media.provider, "tmdb"),
      ),
      columns: { id: true, externalId: true },
    });
    const existingByExtId = new Map(existingRows.map((r) => [r.externalId, r.id]));

    for (const item of uniqueItems.values()) {
      const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
      const existingId = existingByExtId.get(item.result.externalId);
      if (existingId) {
        recMediaIdByKey.set(key, existingId);
      } else {
        const [inserted] = await db
          .insert(media)
          .values({
            type: item.result.type,
            externalId: item.result.externalId,
            provider: item.result.provider ?? "tmdb",
            title: item.result.title,
            overview: item.result.overview ?? null,
            posterPath: item.result.posterPath ?? null,
            backdropPath: item.result.backdropPath ?? null,
            logoPath: item.result.logoPath ?? null,
            releaseDate: item.result.releaseDate || null,
            year: item.result.year ?? null,
            voteAverage: item.result.voteAverage ?? null,
            genreIds: item.result.genreIds ?? [],
            downloaded: false,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          recMediaIdByKey.set(key, inserted.id);
          // Stub row from TMDB's recs/similar payload — enqueue full metadata
          // fetch so read paths (filtered on metadataUpdatedAt) can surface it.
          void dispatchEnsureMedia(inserted.id).catch(
            logAndSwallow("persistExtras dispatchEnsureMedia"),
          );
        } else {
          const existing = await db.query.media.findFirst({
            where: and(
              eq(media.externalId, item.result.externalId),
              eq(media.provider, item.result.provider ?? "tmdb"),
              eq(media.type, item.result.type),
            ),
            columns: { id: true },
          });
          if (existing) recMediaIdByKey.set(key, existing.id);
        }
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    await tx.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    await tx.delete(mediaWatchProvider).where(eq(mediaWatchProvider.mediaId, mediaId));
    await tx.delete(mediaRecommendation).where(eq(mediaRecommendation.sourceMediaId, mediaId));

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

    if (extras.videos.length > 0) {
      await tx.insert(mediaVideo).values(
        extras.videos.map((v) => ({
          mediaId,
          externalKey: v.key,
          site: v.site,
          name: v.name,
          type: v.type,
          official: v.official,
          language: v.language ?? null,
        })),
      );
    }

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
          wpRows.push({ mediaId, providerId: wp.providerId, providerName: wp.providerName, logoPath: wp.logoPath, type: "stream", region });
        }
        for (const wp of data.rent ?? []) {
          wpRows.push({ mediaId, providerId: wp.providerId, providerName: wp.providerName, logoPath: wp.logoPath, type: "rent", region });
        }
        for (const wp of data.buy ?? []) {
          wpRows.push({ mediaId, providerId: wp.providerId, providerName: wp.providerName, logoPath: wp.logoPath, type: "buy", region });
        }
      }

      if (wpRows.length > 0) {
        await tx.insert(mediaWatchProvider).values(wpRows);
      }
    }

    for (const item of uniqueItems.values()) {
      const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
      const recMediaId = recMediaIdByKey.get(key);
      if (!recMediaId) continue;

      await tx
        .insert(mediaRecommendation)
        .values({
          mediaId: recMediaId,
          sourceMediaId: mediaId,
          sourceType: item.sourceType,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(media)
      .set({ extrasUpdatedAt: new Date() })
      .where(eq(media.id, mediaId));
  });
}
