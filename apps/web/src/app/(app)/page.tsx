"use client";

import { trpc } from "~/lib/trpc/client";
import { MediaHero, MediaHeroSkeleton } from "~/components/media/media-hero";
import { MediaCarousel } from "~/components/media/media-carousel";

export default function DiscoverPage(): React.JSX.Element {
  const trendingMovies = trpc.media.trending.useQuery({
    type: "movie",
    page: 1,
  });

  const trendingShows = trpc.media.trending.useQuery({
    type: "show",
    page: 1,
  });

  const library = trpc.library.list.useQuery({
    page: 1,
    pageSize: 20,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  // Pick a spotlight item from trending movies
  const spotlightItem =
    trendingMovies.data?.results && trendingMovies.data.results.length > 0
      ? trendingMovies.data.results[
          Math.floor(Math.random() * Math.min(5, trendingMovies.data.results.length))
        ]
      : null;

  const movieItems = (trendingMovies.data?.results ?? []).map((r) => ({
    externalId: String(r.externalId),
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  const showItems = (trendingShows.data?.results ?? []).map((r) => ({
    externalId: String(r.externalId),
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  const recentLibrary = (library.data?.items ?? []).map((item) => ({
    id: item.id,
    type: item.type as "movie" | "show",
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    voteAverage: item.voteAverage,
  }));

  return (
    <div className="min-h-screen">
      {/* Hero spotlight */}
      {trendingMovies.isLoading ? (
        <MediaHeroSkeleton />
      ) : spotlightItem ? (
        <MediaHero
          externalId={String(spotlightItem.externalId)}
          provider={spotlightItem.provider}
          type={spotlightItem.type as "movie" | "show"}
          title={spotlightItem.title}
          overview={spotlightItem.overview}
          backdropPath={spotlightItem.backdropPath ?? null}
          posterPath={spotlightItem.posterPath ?? null}
          year={spotlightItem.year}
          voteAverage={spotlightItem.voteAverage}
          genres={spotlightItem.genreIds?.map(String)}
        />
      ) : null}

      {/* Carousels */}
      <div className="space-y-10 py-10">
        <MediaCarousel
          title="Trending Movies"
          seeAllHref="/search?type=movie"
          items={movieItems}
          isLoading={trendingMovies.isLoading}
        />

        <MediaCarousel
          title="Trending TV Shows"
          seeAllHref="/search?type=show"
          items={showItems}
          isLoading={trendingShows.isLoading}
        />

        {recentLibrary.length > 0 && (
          <MediaCarousel
            title="Recently Added"
            seeAllHref="/library"
            items={recentLibrary}
          />
        )}
      </div>
    </div>
  );
}
