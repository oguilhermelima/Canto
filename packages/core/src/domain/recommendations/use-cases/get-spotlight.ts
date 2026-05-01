import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { SearchResult } from "@canto/providers";
import { getSetting, setSetting } from "@canto/db/settings";
import {
  buildExclusionSet,
} from "@canto/core/domain/recommendations/use-cases/recommendation-service";
import type { BuildExclusionSetDeps } from "@canto/core/domain/recommendations/use-cases/recommendation-service";
import { MS_PER_HOUR } from "@canto/core/domain/shared/constants";
import { applyMediaItemsLocalizationOverlay } from "@canto/core/domain/shared/localization/localization-service";
import { mapPoolItem } from "@canto/core/domain/shared/mappers/media-mapper";

export interface GetSpotlightDeps extends BuildExclusionSetDeps {
  recs: RecommendationsRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
}

interface TrendingFetcher {
  (type: "movie" | "show"): Promise<{ results: SearchResult[] }>;
}

const SPOTLIGHT_LIMIT = 20;

/**
 * Get per-user spotlight items for the home page hero.
 * Primary: user_recommendation with backdrops.
 * Fallback: global pool, then TMDB trending.
 *
 * `userLang` is supplied by the caller off `ctx.session.user.language` —
 * the old shape did a `SELECT language FROM user` per render even though
 * every caller already had the value on the session.
 */
export async function getSpotlight(
  deps: GetSpotlightDeps,
  userId: string,
  userLang: string,
  tmdb: MediaProviderPort,
  fetchTrending: TrendingFetcher,
) {
  const { excludeSet, excludeItems } = await buildExclusionSet(deps, userId);

  // Path 1: Per-user spotlight — repo applies translation overlay inline via
  // LEFT JOIN on `media_translation`, so we skip the post-query overlay call.
  const userItems = await deps.recs.findUserSpotlightItems(userId, excludeItems, SPOTLIGHT_LIMIT, userLang);
  if (userItems.length > 0) {
    return userItems.map(mapPoolItem);
  }

  // Path 2: Global pool fallback (localization joined inline)
  const poolItems = await deps.extras.findRecommendedMediaWithBackdrops(
    userLang,
    SPOTLIGHT_LIMIT * 3,
  );
  if (poolItems.length > 0) {
    const seen = new Set<string>();
    const unique = poolItems.filter((item) => {
      const key = `${item.provider}-${item.externalId}`;
      if (seen.has(key) || excludeSet.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.slice(0, SPOTLIGHT_LIMIT).map(mapPoolItem);
  }

  // Path 3: TMDB trending fallback (fresh install)
  const cachedData = await getSetting("cache.spotlight");
  if (cachedData && Date.now() - new Date(cachedData.updatedAt).getTime() < MS_PER_HOUR) {
    // The cache stores the raw English TMDB shape (it's a global setting,
    // shared across users). Apply the per-language overlay on read so the
    // user sees localized text/posters/logos for any items already
    // persisted in our DB (e.g. recently visited or in-library items
    // that happen to be trending). Items not in our DB pass through with
    // the cached English copy — there's no localized data to surface.
    const cached = cachedData.data as Array<{
      externalId: number; provider: string; type: "movie" | "show";
      title: string; overview: string; year: number | undefined;
      voteAverage: number; backdropPath: string; logoPath: string | null;
      posterPath?: string | null;
    }>;
    return applyMediaItemsLocalizationOverlay(cached, userLang, {
      localization: deps.localization,
    });
  }

  const [moviesData, showsData] = await Promise.all([
    fetchTrending("movie").catch(() => ({ results: [] as SearchResult[] })),
    fetchTrending("show").catch(() => ({ results: [] as SearchResult[] })),
  ]);

  const halfLimit = Math.ceil(SPOTLIGHT_LIMIT / 2);
  const movies = moviesData.results.slice(0, halfLimit).map((m) => ({
    externalId: m.externalId, type: "movie" as const,
    title: m.title, overview: m.overview ?? "",
    year: m.year, voteAverage: m.voteAverage ?? 0,
  }));

  const shows = showsData.results.slice(0, halfLimit).map((s) => ({
    externalId: s.externalId, type: "show" as const,
    title: s.title, overview: s.overview ?? "",
    year: s.year, voteAverage: s.voteAverage ?? 0,
  }));

  const mixed: Array<(typeof movies)[number] | (typeof shows)[number]> = [];
  for (let i = 0; i < halfLimit; i++) {
    const show = shows[i];
    const movie = movies[i];
    if (show) mixed.push(show);
    if (movie) mixed.push(movie);
  }

  const results = await Promise.all(
    mixed.slice(0, SPOTLIGHT_LIMIT).map(async (item) => {
      try {
        const metadata = await tmdb.getMetadata(item.externalId, item.type);
        const backdropPath = metadata.backdropPath;
        if (!backdropPath) return null;

        let logoPath: string | null = null;
        if (tmdb.getImages) {
          const tmdbType = item.type === "show" ? "tv" as const : "movie" as const;
          const images = await tmdb.getImages(item.externalId, tmdbType);
          const enLogos = images.logos.filter((l) => l.iso_639_1 === "en");
          logoPath = enLogos[0]?.file_path ?? null;
        }

        return {
          externalId: item.externalId, provider: "tmdb",
          type: item.type, title: item.title,
          overview: item.overview, year: item.year,
          voteAverage: item.voteAverage, backdropPath, logoPath,
          posterPath: metadata.posterPath ?? null,
        };
      } catch { return null; }
    }),
  );

  const spotlightResults = results.filter((r): r is NonNullable<typeof r> => r !== null);

  await setSetting("cache.spotlight", { data: spotlightResults, updatedAt: new Date().toISOString() });

  return applyMediaItemsLocalizationOverlay(spotlightResults, userLang, {
    localization: deps.localization,
  });
}
