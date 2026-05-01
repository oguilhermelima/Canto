import type { MediaExtras } from "@canto/providers";
import type { Database } from "@canto/db/client";

import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaProvider } from "@canto/core/domain/media/types/media";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";

const EN = "en-US";

export interface PersistExtrasDeps {
  extras: MediaExtrasRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  media: MediaRepositoryPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
}

/**
 * Persist media extras (credits, videos, watch providers, recommendations).
 * Handles delete + re-insert for simple tables and full re-link for the
 * recommendation junctions.
 */
export async function persistExtras(
  _db: Database,
  mediaId: string,
  extras: MediaExtras,
  deps: PersistExtrasDeps,
): Promise<void> {
  // Each similar/recommendation needs a media row to link to via the junction
  // table. Stub rows (no media_aspect_state row for `metadata`) trigger a
  // full fetch on visit.

  const allRecItems = [
    ...extras.similar.map((r) => ({
      result: r,
      sourceType: "similar" as const,
    })),
    ...extras.recommendations.map((r) => ({
      result: r,
      sourceType: "recommendation" as const,
    })),
  ];

  const uniqueItems = new Map<string, (typeof allRecItems)[number]>();
  for (const item of allRecItems) {
    const key = `${item.result.provider}-${item.result.externalId}`;
    if (!uniqueItems.has(key)) uniqueItems.set(key, item);
  }

  const recMediaIdByKey = new Map<string, string>();

  if (uniqueItems.size > 0) {
    const extIds = [...uniqueItems.values()].map((i) => i.result.externalId);
    const existingRows = await deps.media.findIdsByExternalIdsForProvider(
      extIds,
      "tmdb",
    );
    const existingByExtId = new Map(
      existingRows.map((r) => [r.externalId, r.id]),
    );

    for (const item of uniqueItems.values()) {
      const key = `${item.result.provider}-${item.result.externalId}`;
      const existingId = existingByExtId.get(item.result.externalId);
      if (existingId) {
        recMediaIdByKey.set(key, existingId);
      } else {
        const provider: MediaProvider = item.result.provider;
        const inserted = await deps.media.tryCreateMedia({
          type: item.result.type,
          externalId: item.result.externalId,
          provider,
          backdropPath: item.result.backdropPath ?? null,
          releaseDate: item.result.releaseDate || null,
          year: item.result.year ?? null,
          voteAverage: item.result.voteAverage ?? null,
          genreIds: item.result.genreIds ?? [],
          downloaded: false,
        });
        if (inserted) {
          recMediaIdByKey.set(key, inserted.id);
          await deps.localization.upsertMediaLocalization(
            inserted.id,
            EN,
            {
              title: item.result.title,
              overview: item.result.overview ?? null,
              posterPath: item.result.posterPath ?? null,
              logoPath: item.result.logoPath ?? null,
            },
            "tmdb",
          );
          // Stub row from TMDB's recs/similar payload — enqueue full metadata
          // fetch so read paths (filtered on the metadata aspect having
          // succeeded) can surface it.
          void deps.dispatcher.enrichMedia(inserted.id).catch(
            deps.logger.logAndSwallow("persistExtras dispatchEnsureMedia"),
          );
        } else {
          const existing = await deps.media.findByExternalId(
            item.result.externalId,
            provider,
            item.result.type,
          );
          if (existing) recMediaIdByKey.set(key, existing.id);
        }
      }
    }
  }

  await deps.extras.deleteCreditsByMediaId(mediaId);
  await deps.extras.deleteVideosByMediaId(mediaId);
  await deps.extras.deleteWatchProvidersByMediaId(mediaId);
  await deps.extras.deleteRecommendationsBySource(mediaId);

  if (extras.credits.cast.length > 0) {
    await deps.extras.insertCredits(
      extras.credits.cast.map((c, _i) => ({
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

  for (const item of uniqueItems.values()) {
    const key = `${item.result.provider}-${item.result.externalId}`;
    const recMediaId = recMediaIdByKey.get(key);
    if (!recMediaId) continue;

    await deps.extras.insertRecommendation({
      mediaId: recMediaId,
      sourceMediaId: mediaId,
      sourceType: item.sourceType,
    });
  }
}
