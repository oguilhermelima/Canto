import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../../ports/media-provider.port";
import type { SearchResult } from "@canto/providers";
import { getSetting, setSetting } from "@canto/db/settings";
import { buildExclusionSet } from "../../services/recommendation-service";
import { translateMediaItems } from "../../services/translation-service";
import { getUserLanguage } from "../../services/user-service";
import { mapPoolItem } from "../../mappers/media-mapper";
import { findRecommendedMediaWithBackdrops } from "../../../infrastructure/repositories/extras-repository";
import { findUserSpotlightItems } from "../../../infrastructure/repositories/recommendations/user-recommendation";

interface TrendingFetcher {
  (type: "movie" | "show"): Promise<{ results: SearchResult[] }>;
}

/**
 * Get per-user spotlight items for the home page hero.
 * Primary: user_recommendation with backdrops.
 * Fallback: global pool, then TMDB trending.
 */
export async function getSpotlight(
  db: Database,
  userId: string,
  tmdb: MediaProviderPort,
  fetchTrending: TrendingFetcher,
) {
  const userLang = await getUserLanguage(db, userId);
  const { excludeSet, excludeItems } = await buildExclusionSet(db, userId);

  // Path 1: Per-user spotlight
  const userItems = await findUserSpotlightItems(db, userId, excludeItems, 10);
  if (userItems.length > 0) {
    return translateMediaItems(db, userItems.map(mapPoolItem), userLang);
  }

  // Path 2: Global pool fallback
  const poolItems = await findRecommendedMediaWithBackdrops(db, 30);
  if (poolItems.length > 0) {
    const seen = new Set<string>();
    const unique = poolItems.filter((item) => {
      const key = `${item.provider ?? "tmdb"}-${item.externalId}`;
      if (seen.has(key) || excludeSet.has(key)) return false;
      seen.add(key);
      return true;
    });
    return translateMediaItems(db, unique.slice(0, 10).map(mapPoolItem), userLang);
  }

  // Path 3: TMDB trending fallback (fresh install)
  const ONE_HOUR_MS = 60 * 60 * 1000;

  const cachedData = await getSetting("cache.spotlight");
  if (cachedData && Date.now() - new Date(cachedData.updatedAt).getTime() < ONE_HOUR_MS) {
    return cachedData.data as Array<{
      externalId: number; provider: string; type: "movie" | "show";
      title: string; overview: string; year: number | undefined;
      voteAverage: number; backdropPath: string; logoPath: string | null;
    }>;
  }

  const [moviesData, showsData] = await Promise.all([
    fetchTrending("movie").catch(() => ({ results: [] as SearchResult[] })),
    fetchTrending("show").catch(() => ({ results: [] as SearchResult[] })),
  ]);

  const movies = moviesData.results.slice(0, 5).map((m) => ({
    externalId: m.externalId, type: "movie" as const,
    title: m.title, overview: m.overview ?? "",
    year: m.year, voteAverage: m.voteAverage ?? 0,
  }));

  const shows = showsData.results.slice(0, 5).map((s) => ({
    externalId: s.externalId, type: "show" as const,
    title: s.title, overview: s.overview ?? "",
    year: s.year, voteAverage: s.voteAverage ?? 0,
  }));

  const mixed: Array<(typeof movies)[number] | (typeof shows)[number]> = [];
  for (let i = 0; i < 5; i++) {
    const show = shows[i];
    const movie = movies[i];
    if (show) mixed.push(show);
    if (movie) mixed.push(movie);
  }

  const results = await Promise.all(
    mixed.slice(0, 10).map(async (item) => {
      try {
        const metadata = await tmdb.getMetadata(item.externalId, item.type);
        const backdropPath = metadata.backdropPath;
        if (!backdropPath) return null;

        let logoPath: string | null = null;
        if (tmdb.getImages) {
          const tmdbType = item.type === "show" ? "tv" as const : "movie" as const;
          const images = await tmdb.getImages(item.externalId, tmdbType);
          const enLogos = (images.logos ?? []).filter((l) => l.iso_639_1 === "en");
          logoPath = enLogos.length > 0 ? enLogos[0]!.file_path : null;
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

  return translateMediaItems(db, spotlightResults, userLang);
}
