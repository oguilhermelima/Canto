import type { Database } from "@canto/db/client";
import type { MediaType } from "@canto/providers";

import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { mapSearchResultToMediaFields } from "@canto/core/domain/content-enrichment/rules/pool-scoring";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";

const EN = "en-US";

export interface RefreshExtrasDeps {
  tmdb: MediaProviderPort;
  extras: MediaExtrasRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  media: MediaRepositoryPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
}

export async function refreshExtras(
  db: Database,
  mediaId: string,
  deps: RefreshExtrasDeps,
): Promise<void> {
  const row = await deps.media.findById(mediaId);
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
      } catch {
        /* fallback to title search */
      }
    }
    // If IMDB didn't work, try title search using the en-US localization.
    if (extrasExternalId === row.externalId) {
      const enLoc = await deps.localization.findLocalizedById(row.id, EN);
      const searchTitle = enLoc?.title;
      if (searchTitle) {
        try {
          const search = await tmdb.search(
            searchTitle,
            row.type as "movie" | "show",
          );
          const first = search.results[0];
          if (first) extrasExternalId = first.externalId;
        } catch {
          /* skip extras if we can't find TMDB equivalent */
        }
      }
    }
    // Inside this branch `row.provider !== "tmdb"`; if neither IMDB nor
    // title search rebound the external id, we can't find a TMDB equivalent.
    if (extrasExternalId === row.externalId) return;
  }

  const supportedLangs = [...(await getActiveUserLanguages(db))];
  const extras = await tmdb.getExtras(extrasExternalId, row.type as MediaType, {
    supportedLanguages: supportedLangs,
  });

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
  const existingRecs =
    await deps.extras.findRecommendationsForSource(mediaId);

  const recExternalIds = [...uniqueRecItems.values()].map(
    (i) => i.result.externalId,
  );
  const recTitles = [...uniqueRecItems.values()].map((i) => i.result.title);
  const existingMedia = await deps.extras.findExistingMediaByExternalRefs(
    recExternalIds,
    recTitles,
    row.type,
  );
  const existingMediaByExtId = new Map(
    existingMedia.filter((m) => m.provider === "tmdb").map((m) => [m.externalId, m]),
  );
  const existingMediaByTitle = new Map(
    existingMedia
      .filter((m) => m.provider === "tvdb" && m.title !== null)
      .map((m) => [m.title as string, m]),
  );

  const trailerMap = new Map<number, string>();
  const logoMap = new Map<number, string>();

  // Only fetch trailers + logos for items that don't already have them
  const itemsNeedingFetch = [...uniqueRecItems.values()].filter((item) => {
    const existing =
      existingMediaByExtId.get(item.result.externalId) ??
      existingMediaByTitle.get(item.result.title);
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

          const enLogos = images.logos.filter(
            (l) => l.iso_639_1 === "en" || l.iso_639_1 === null,
          );
          const firstLogo = enLogos[0];
          if (firstLogo) logoMap.set(item.result.externalId, firstLogo.file_path);
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

  // ── Upsert media rows for recommendations (may already exist) ──
  const mediaIdByExtKey = new Map<string, string>();
  for (const fields of newRecFields) {
    const key = `${fields.provider}-${fields.externalId}`;
    const existing =
      existingMediaByExtId.get(fields.externalId) ??
      existingMediaByTitle.get(fields.title);
    if (existing) {
      mediaIdByExtKey.set(key, existing.id);
      if (!existing.logoPath && fields.logoPath) {
        // After Phase 1C-δ, logoPath is only persisted on media_localization.
        await deps.localization.upsertMediaLocalization(
          existing.id,
          EN,
          { title: fields.title, logoPath: fields.logoPath },
          "tmdb",
        );
      }
    } else {
      const inserted = await deps.media.createMedia({
        type: fields.type,
        externalId: fields.externalId,
        provider: fields.provider,
        backdropPath: fields.backdropPath ?? null,
        releaseDate: fields.releaseDate ?? null,
        voteAverage: fields.voteAverage ?? null,
        downloaded: false,
      });
      mediaIdByExtKey.set(key, inserted.id);
      // After Phase 1C-δ, title/overview/posterPath/logoPath live only on
      // media_localization en-US.
      await deps.localization.upsertMediaLocalization(
        inserted.id,
        EN,
        {
          title: fields.title,
          overview: fields.overview ?? null,
          posterPath: fields.posterPath ?? null,
          logoPath: fields.logoPath ?? null,
        },
        "tmdb",
      );
      // Stub row from TMDB's recs/similar payload — enqueue full metadata
      // fetch so the row is filled in before any user-facing query surfaces
      // it (read paths filter on the metadata aspect having succeeded).
      void deps.dispatcher.enrichMedia(inserted.id).catch(
        deps.logger.logAndSwallow("refresh-extras dispatchEnsureMedia"),
      );
    }
  }

  // Build lookup for existing recommendation junction entries
  const existingRecByMediaId = new Map(
    existingRecs.map((r) => [r.mediaId, r]),
  );

  // ── DB writes via port: replace simple tables, diff recommendations ──
  await deps.extras.deleteCreditsByMediaId(mediaId);
  await deps.extras.deleteVideosByMediaId(mediaId);
  await deps.extras.deleteWatchProvidersByMediaId(mediaId);

  // Insert credits (cast)
  if (extras.credits.cast.length > 0) {
    await deps.extras.insertCredits(
      extras.credits.cast.map((c) => ({
        mediaId,
        personId: c.id,
        name: c.name,
        character: c.character,
        profilePath: c.profilePath,
        type: "cast" as const,
        order: c.order,
      })),
    );
  }

  // Insert credits (crew)
  if (extras.credits.crew.length > 0) {
    await deps.extras.insertCredits(
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
    await deps.extras.insertVideos(
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
      logoPath: string | null;
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
      await deps.extras.insertWatchProviders(wpRows);
    }
  }

  // ── Diff-based media_recommendation update ──

  // Delete junction entries for items no longer in the TMDB response
  const newRecMediaIds = new Set(mediaIdByExtKey.values());
  const toDelete = existingRecs
    .filter((r) => !newRecMediaIds.has(r.mediaId))
    .map((r) => r.id);
  if (toDelete.length > 0) {
    await deps.extras.deleteRecommendationsByIds(toDelete);
  }

  // Insert new junction entries (skip existing)
  for (const fields of newRecFields) {
    const key = `${fields.provider}-${fields.externalId}`;
    const recMediaId = mediaIdByExtKey.get(key);
    if (!recMediaId) continue;
    if (existingRecByMediaId.has(recMediaId)) continue; // Already linked

    await deps.extras.insertRecommendation({
      mediaId: recMediaId,
      sourceMediaId: mediaId,
      sourceType: fields.sourceType,
    });
  }

  // `trailerMap` is collected for parity with the legacy implementation but
  // not yet persisted — recommendation items get their trailers re-resolved
  // via the per-media `media_video` table. Suppress unused-variable noise.
  void trailerMap;
}
