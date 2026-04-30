import type { Database } from "@canto/db/client";

import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import { applyMediaItemsLocalizationOverlay } from "@canto/core/domain/shared/localization/localization-service";
import { mapPoolItem } from "@canto/core/domain/shared/mappers/media-mapper";

export interface LoadExtrasDeps {
  extras: MediaExtrasRepositoryPort;
}

/**
 * Load extras (credits, videos, watch providers, similar, recs) from DB
 * tables for an already-persisted media item. The caller threads in the
 * extras port; localization overlay still goes through `db` because the
 * mapper helpers JOIN against the structural `media` row.
 */
export async function loadExtrasFromDB(
  db: Database,
  mediaId: string,
  lang: string,
  deps: LoadExtrasDeps,
) {
  const [credits, videos, watchProviders, similar, recommendations] =
    await Promise.all([
      deps.extras.findCreditsByMediaId(mediaId),
      deps.extras.findVideosByMediaId(mediaId),
      deps.extras.findWatchProvidersByMediaId(mediaId),
      deps.extras.findRecommendationsBySource(mediaId, "similar", lang),
      deps.extras.findRecommendationsBySource(mediaId, "recommendation", lang),
    ]);

  const cast = credits
    .filter((c) => c.type === "cast")
    .map((c) => ({
      id: c.personId,
      name: c.name,
      character: c.character ?? "",
      profilePath: c.profilePath ?? undefined,
      order: c.order,
    }));

  const crew = credits
    .filter((c) => c.type === "crew")
    .map((c) => ({
      id: c.personId,
      name: c.name,
      job: c.job ?? "",
      department: c.department ?? "",
      profilePath: c.profilePath ?? undefined,
    }));

  const wpByRegion: Record<
    string,
    {
      link?: string;
      flatrate?: Array<{
        providerId: number;
        providerName: string;
        logoPath: string;
      }>;
      rent?: Array<{
        providerId: number;
        providerName: string;
        logoPath: string;
      }>;
      buy?: Array<{
        providerId: number;
        providerName: string;
        logoPath: string;
      }>;
    }
  > = {};

  for (const wp of watchProviders) {
    if (!wpByRegion[wp.region]) wpByRegion[wp.region] = {};
    const region = wpByRegion[wp.region]!;
    const entry = {
      providerId: wp.providerId,
      providerName: wp.providerName,
      logoPath: wp.logoPath ?? "",
    };
    if (wp.type === "stream") {
      (region.flatrate ??= []).push(entry);
    } else if (wp.type === "rent") {
      (region.rent ??= []).push(entry);
    } else if (wp.type === "buy") {
      (region.buy ??= []).push(entry);
    }
  }

  const mappedSimilar = similar.map(mapPoolItem);
  const mappedRecs = recommendations.map(mapPoolItem);
  const [translatedSimilar, translatedRecs] = await Promise.all([
    applyMediaItemsLocalizationOverlay(db, mappedSimilar, lang),
    applyMediaItemsLocalizationOverlay(db, mappedRecs, lang),
  ]);

  const langPrefix = lang.split("-")[0];
  const mappedVideos = videos.map((v) => ({
    id: v.id,
    key: v.externalKey,
    name: v.name,
    site: v.site,
    type: v.type,
    official: v.official,
    language: v.language ?? null,
  }));

  // Prefer user's full locale (e.g., "pt-BR"), then 2-letter prefix ("pt"), then en/untagged
  const exactLangVideos = mappedVideos.filter((v) => v.language === lang);
  const userLangVideos =
    exactLangVideos.length > 0
      ? exactLangVideos
      : mappedVideos.filter((v) => v.language === langPrefix);
  const finalVideos =
    userLangVideos.length > 0
      ? userLangVideos
      : mappedVideos.filter((v) => !v.language || v.language === "en");

  // Sort by type: Trailer > Teaser > rest
  finalVideos.sort((a, b) => {
    const typeScore = (v: typeof a) =>
      v.type === "Trailer" ? 0 : v.type === "Teaser" ? 1 : 2;
    return typeScore(a) - typeScore(b);
  });

  return {
    credits: { cast, crew },
    similar: translatedSimilar,
    recommendations: translatedRecs,
    videos: finalVideos,
    watchProviders: wpByRegion,
  };
}
