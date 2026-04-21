import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import {
  media,
  mediaCredit,
  mediaRecommendation,
  mediaVideo,
  mediaWatchProvider,
} from "@canto/db/schema";
import { getActiveUserLanguages } from "../../services/user-service";
import type { MediaType } from "@canto/providers";
import { findMediaById } from "../../../infrastructure/repositories";
import type { MediaProviderPort } from "../../ports/media-provider.port";
import { mapSearchResultToMediaFields } from "../../rules/pool-scoring";
import { dispatchMediaPipeline } from "../../../infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "../../../lib/log-error";

export async function refreshExtras(
  db: Database,
  mediaId: string,
  deps: { tmdb: MediaProviderPort },
): Promise<void> {
  const row = await findMediaById(db, mediaId);
  if (!row) return;

  const tmdb = deps.tmdb;

  // Resolve TMDB external ID for extras (always fetch from TMDB)
  let extrasExternalId = row.externalId;
  if (row.provider !== "tmdb") {
    // Try IMDB cross-reference first
    if (row.imdbId && tmdb.findByImdbId) {
      try {
        const found = await tmdb.findByImdbId(row.imdbId);
        const match = found.find((r) => r.type === row.type);
        if (match) extrasExternalId = match.externalId;
      } catch { /* fallback to title search */ }
    }
    // If IMDB didn't work, try title search
    if (extrasExternalId === row.externalId) {
      try {
        const search = await tmdb.search(row.title, row.type as "movie" | "show");
        if (search.results.length > 0) extrasExternalId = search.results[0]!.externalId;
      } catch { /* skip extras if we can't find TMDB equivalent */ }
    }
    if (extrasExternalId === row.externalId && row.provider !== "tmdb") return; // Can't find TMDB match
  }

  const supportedLangs = [...await getActiveUserLanguages(db)];
  const extras = await tmdb.getExtras(extrasExternalId, row.type as MediaType, { supportedLanguages: supportedLangs });

  // ── Pre-transaction: build recommendation items and fetch trailers/logos (NETWORK I/O) ──

  const allRecItems = [
    ...extras.recommendations.map((r) => ({
      result: r,
      sourceType: "recommendation" as const,
    })),
    ...extras.similar.map((r) => ({
      result: r,
      sourceType: "similar" as const,
    })),
  ];

  // Dedup by externalId before fetching trailers
  const uniqueRecItems = new Map<number, (typeof allRecItems)[number]>();
  for (const item of allRecItems) {
    if (!uniqueRecItems.has(item.result.externalId)) {
      uniqueRecItems.set(item.result.externalId, item);
    }
  }

  // Fetch existing media_recommendation entries BEFORE the transaction (for diff)
  const existingRecs = await db
    .select({
      id: mediaRecommendation.id,
      mediaId: mediaRecommendation.mediaId,
      sourceType: mediaRecommendation.sourceType,
    })
    .from(mediaRecommendation)
    .where(eq(mediaRecommendation.sourceMediaId, mediaId));

  // Also look up existing media rows for the recommended items' external IDs
  // Check both tmdb provider AND tvdb-provider rows (which store tvdb_id = external_id)
  // to avoid creating cross-provider duplicates
  const recExternalIds = [...uniqueRecItems.values()].map((i) => i.result.externalId);
  const recTitles = [...uniqueRecItems.values()].map((i) => i.result.title);
  const existingMedia = recExternalIds.length > 0
    ? await db.query.media.findMany({
        where: sql`(
          (${media.externalId} IN (${sql.join(recExternalIds.map((id) => sql`${id}`), sql`, `)}) AND ${media.provider} = 'tmdb')
          OR (${media.provider} = 'tvdb' AND ${media.type} = ${row.type} AND ${media.title} IN (${sql.join(recTitles.map((t) => sql`${t}`), sql`, `)}))
        )`,
        columns: { id: true, externalId: true, title: true, provider: true, type: true, logoPath: true },
      })
    : [];
  // Map by TMDB external ID; for tvdb-provider rows, build a title lookup fallback
  const existingMediaByExtId = new Map(
    existingMedia.filter((m) => m.provider === "tmdb").map((m) => [m.externalId, m]),
  );
  const existingMediaByTitle = new Map(
    existingMedia.filter((m) => m.provider === "tvdb").map((m) => [m.title, m]),
  );

  const trailerMap = new Map<number, string>();
  const logoMap = new Map<number, string>();

  // Only fetch trailers + logos for items that don't already have them
  const itemsNeedingFetch = [...uniqueRecItems.values()].filter((item) => {
    const existing = existingMediaByExtId.get(item.result.externalId)
      ?? existingMediaByTitle.get(item.result.title);
    return !existing?.logoPath;
  });

  for (let i = 0; i < itemsNeedingFetch.length; i += 10) {
    const batch = itemsNeedingFetch.slice(i, i + 10);
    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          if (!tmdb.getVideos || !tmdb.getImages) return;
          const tmdbType = item.result.type === "show" ? "tv" : "movie";
          const [videos, images] = await Promise.all([
            tmdb.getVideos(item.result.externalId, tmdbType, supportedLangs),
            tmdb.getImages(item.result.externalId, tmdbType),
          ]);

          const enTrailer = videos.find(
            (v) =>
              v.type === "Trailer" &&
              v.site === "YouTube" &&
              (!v.language || v.language === "en"),
          );
          if (enTrailer) trailerMap.set(item.result.externalId, enTrailer.key);

          const enLogos = (images.logos ?? []).filter(
            (l) => l.iso_639_1 === "en" || l.iso_639_1 === null,
          );
          if (enLogos.length > 0)
            logoMap.set(item.result.externalId, enLogos[0]!.file_path);
        } catch {
          // Best-effort
        }
      }),
    );
  }

  // Build media field objects for recommendation items
  const newRecFields = [...uniqueRecItems.values()].map((item) =>
    mapSearchResultToMediaFields(item.result, item.sourceType, {
      logoPath: logoMap.get(item.result.externalId),
    }),
  );
  const newKeys = new Set(
    newRecFields.map((r) => `${r.provider}-${r.externalId}`),
  );

  // ── Upsert media rows for recommendations (may already exist) ──
  const mediaIdByExtKey = new Map<string, string>();
  for (const fields of newRecFields) {
    const key = `${fields.provider}-${fields.externalId}`;
    const existing = existingMediaByExtId.get(fields.externalId)
      ?? existingMediaByTitle.get(fields.title);
    if (existing) {
      mediaIdByExtKey.set(key, existing.id);
      if (!existing.logoPath && fields.logoPath) {
        await db.update(media).set({ logoPath: fields.logoPath }).where(eq(media.id, existing.id));
      }
    } else {
      const [inserted] = await db.insert(media).values({
        type: fields.type,
        externalId: fields.externalId,
        provider: fields.provider,
        title: fields.title,
        overview: fields.overview ?? null,
        posterPath: fields.posterPath ?? null,
        backdropPath: fields.backdropPath ?? null,
        logoPath: fields.logoPath ?? null,
        releaseDate: fields.releaseDate || null,
        voteAverage: fields.voteAverage ?? null,
        downloaded: false,
      }).onConflictDoNothing().returning();
      if (inserted) {
        mediaIdByExtKey.set(key, inserted.id);
        // Stub row from TMDB's recs/similar payload — enqueue full metadata
        // fetch so the row is filled in before any user-facing query surfaces
        // it (read paths filter on `metadataUpdatedAt IS NOT NULL`).
        void dispatchMediaPipeline({ mediaId: inserted.id }).catch(
          logAndSwallow("refresh-extras dispatchMediaPipeline"),
        );
      } else {
        const conflict = await db.query.media.findFirst({
          where: and(eq(media.externalId, fields.externalId), eq(media.provider, fields.provider), eq(media.type, fields.type)),
          columns: { id: true },
        });
        if (conflict) mediaIdByExtKey.set(key, conflict.id);
      }
    }
  }

  // Build lookup for existing recommendation junction entries
  const existingRecByMediaId = new Map(
    existingRecs.map((r) => [r.mediaId, r]),
  );

  // ── Transaction: only DB writes, no network I/O ──

  await db.transaction(async (tx) => {
    // Clear existing data for this media
    await tx.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    await tx.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    await tx
      .delete(mediaWatchProvider)
      .where(eq(mediaWatchProvider.mediaId, mediaId));

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

    // Insert videos (with language tag for localization)
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

    // ── Diff-based media_recommendation update ──

    // Delete junction entries for items no longer in the TMDB response
    const newRecMediaIds = new Set(mediaIdByExtKey.values());
    const toDelete = existingRecs
      .filter((r) => !newRecMediaIds.has(r.mediaId))
      .map((r) => r.id);
    if (toDelete.length > 0) {
      await tx.delete(mediaRecommendation).where(
        sql`${mediaRecommendation.id} IN (${sql.join(
          toDelete.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    }

    // Insert new junction entries (skip existing)
    for (const fields of newRecFields) {
      const key = `${fields.provider}-${fields.externalId}`;
      const recMediaId = mediaIdByExtKey.get(key);
      if (!recMediaId) continue;
      if (existingRecByMediaId.has(recMediaId)) continue; // Already linked

      await tx
        .insert(mediaRecommendation)
        .values({
          mediaId: recMediaId,
          sourceMediaId: mediaId,
          sourceType: fields.sourceType,
        })
        .onConflictDoNothing();
    }

    // Update extrasUpdatedAt
    await tx
      .update(media)
      .set({ extrasUpdatedAt: new Date() })
      .where(eq(media.id, mediaId));
  });
}
