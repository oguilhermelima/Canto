"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { MediaBadges } from "~/components/media/media-badges";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { FeaturedCarousel } from "~/components/media/featured-carousel";
import { LibraryButton } from "~/components/media/library-button";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface SpotlightItem {
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  overview: string | undefined;
  year: number | undefined;
  voteAverage: number | undefined;
  backdropPath: string;
  logoPath: string | null;
}

export default function DiscoverPage(): React.JSX.Element {
  const MAX_CAROUSEL_PAGES = 3;

  const infiniteOpts = {
    staleTime: 60 * 1000,
    getNextPageParam: (
      lastPage: { totalPages: number },
      allPages: unknown[],
      lastPageParam: unknown,
    ) => {
      const currentPage = (lastPageParam as number) ?? 1;
      if (currentPage >= MAX_CAROUSEL_PAGES || currentPage >= lastPage.totalPages) return undefined;
      return currentPage + 1;
    },
    initialCursor: 1,
  };

  const trendingMovies = trpc.media.browse.useInfiniteQuery({ type: "movie" }, infiniteOpts);
  const trendingShows = trpc.media.browse.useInfiniteQuery({ type: "show" }, infiniteOpts);
  const trendingAnime = trpc.media.browse.useInfiniteQuery({ type: "show", genres: "16", language: "ja" }, infiniteOpts);
  const animeMovies = trpc.media.browse.useInfiniteQuery({ type: "movie", mode: "discover", genres: "16", language: "ja" }, infiniteOpts);
  const recommendations = trpc.media.recommendations.useInfiniteQuery(
    { pageSize: 10 },
    {
      staleTime: 5 * 60 * 1000,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  const library = trpc.library.list.useQuery({
    page: 1,
    pageSize: 500,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  const downloadedLibrary = trpc.library.list.useQuery({
    page: 1,
    pageSize: 20,
    downloaded: true,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  const utils = trpc.useUtils();

  // Check if any spotlight/carousel item is in library
  const libraryIds = useMemo(() => {
    const items = library.data?.items ?? [];
    return new Set(items.map((i) => `${i.provider}-${i.externalId}`));
  }, [library.data]);

  // Spotlight from backend
  const spotlightQuery = trpc.provider.spotlight.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const spotlightItems = (spotlightQuery.data ?? []) as SpotlightItem[];
  const loadingSpotlight = spotlightQuery.isLoading;
  const [currentSpotlight, setCurrentSpotlight] = useState(0);

  const currentItem = spotlightItems[currentSpotlight];
  const isInLibrary = currentItem
    ? libraryIds.has(`${currentItem.provider}-${currentItem.externalId}`)
    : false;

  const nextSpotlight = useCallback(() => {
    setCurrentSpotlight((prev) =>
      spotlightItems.length === 0 ? 0 : (prev + 1) % spotlightItems.length,
    );
  }, [spotlightItems.length]);

  const prevSpotlight = useCallback(() => {
    setCurrentSpotlight((prev) =>
      spotlightItems.length === 0
        ? 0
        : (prev - 1 + spotlightItems.length) % spotlightItems.length,
    );
  }, [spotlightItems.length]);

  // Flatten infinite query pages
  const flatMovies = useMemo(() => trendingMovies.data?.pages.flatMap((p) => p.results) ?? [], [trendingMovies.data]);
  const flatShows = useMemo(() => trendingShows.data?.pages.flatMap((p) => p.results) ?? [], [trendingShows.data]);
  const flatAnime = useMemo(() => trendingAnime.data?.pages.flatMap((p) => p.results) ?? [], [trendingAnime.data]);
  const flatAnimeMovies = useMemo(() => animeMovies.data?.pages.flatMap((p) => p.results) ?? [], [animeMovies.data]);


  // Set page title
  useEffect(() => {
    document.title = "Discover — Canto";
  }, []);

  // Auto-rotate spotlight
  useEffect(() => {
    if (spotlightItems.length <= 1) return;
    const interval = setInterval(nextSpotlight, 8000);
    return () => clearInterval(interval);
  }, [spotlightItems.length, nextSpotlight]);

  const mapItems = useCallback(
    (results: typeof flatMovies) =>
      results.map((r) => ({
        externalId: String(r.externalId),
        provider: r.provider,
        type: r.type as "movie" | "show",
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
      })),
    [],
  );

  const movieItems = useMemo(() => mapItems(flatMovies), [mapItems, flatMovies]);
  const showItems = useMemo(() => mapItems(flatShows), [mapItems, flatShows]);
  const animeItems = useMemo(() => mapItems(flatAnime), [mapItems, flatAnime]);
  const animeMovieItems = useMemo(() => mapItems(flatAnimeMovies), [mapItems, flatAnimeMovies]);

  const recentLibrary = (library.data?.items ?? []).map((item) => ({
    id: item.id,
    type: item.type as "movie" | "show",
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    voteAverage: item.voteAverage,
    href: `/media/${item.id}`,
  }));

  const myDownloads = (downloadedLibrary.data?.items ?? []).map((item) => ({
    id: item.id,
    type: item.type as "movie" | "show",
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    voteAverage: item.voteAverage,
    href: `/media/${item.id}`,
  }));

  const getPreviewUrl = (item: SpotlightItem): string => {
    return `/media/ext?provider=${item.provider}&externalId=${item.externalId}&type=${item.type}`;
  };

  return (
    <div className="min-h-screen">
      {/* Spotlight Hero — extends behind topbar */}
      <div className="spotlight relative -mt-16 min-h-[90vh] w-full md:min-h-[80vh]">
        {/* Backdrop */}
        {currentItem?.backdropPath ? (
          <div
            key={currentSpotlight}
            className="absolute inset-0 overflow-hidden"
          >
            <Image
              src={`${TMDB_IMAGE_BASE}/original${currentItem.backdropPath}`}
              alt=""
              fill
              className="object-cover object-center animate-[spotlightFadeIn_1s_cubic-bezier(0.16,1,0.3,1)_both]"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background from-5% via-background/40 via-35% to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-background/20 to-transparent" />
          </div>
        ) : loadingSpotlight ? (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
        )}

        {/* Content */}
        <div
          className="relative mx-auto flex min-h-[90vh] w-full flex-col justify-end px-4 pb-16 pt-24 md:min-h-[80vh] md:px-8 lg:px-12 xl:px-16 2xl:px-24"
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) (e.currentTarget as HTMLElement).dataset.touchX = String(touch.clientX);
          }}
          onTouchEnd={(e) => {
            const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? "0");
            const endX = e.changedTouches[0]?.clientX ?? 0;
            const diff = startX - endX;
            if (Math.abs(diff) > 50 && spotlightItems.length > 1) {
              if (diff > 0) setCurrentSpotlight((p) => (p + 1) % spotlightItems.length);
              else setCurrentSpotlight((p) => (p - 1 + spotlightItems.length) % spotlightItems.length);
            }
          }}
        >
          {loadingSpotlight ? (
            <div className="flex max-w-2xl flex-col gap-5">
              <Skeleton className="h-24 w-96 max-w-full bg-foreground/10" />
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-5 w-14 bg-foreground/10" />
                <Skeleton className="h-5 w-12 bg-foreground/10" />
                <Skeleton className="h-5 w-20 bg-foreground/10" />
              </div>
              <Skeleton className="h-16 w-full max-w-2xl bg-foreground/10" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-36 rounded-full bg-foreground/10" />
                <Skeleton className="h-10 w-10 rounded-full bg-foreground/10" />
              </div>
            </div>
          ) : currentItem ? (
            <div
              key={currentSpotlight}
              className="flex max-w-2xl flex-col gap-5 animate-[contentSlideIn_0.7s_cubic-bezier(0.16,1,0.3,1)_both_0.2s]"
            >
              <Link href={getPreviewUrl(currentItem)} className="flex flex-col gap-5">
              {/* Logo or Title */}
              {currentItem.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${TMDB_IMAGE_BASE}/w500${currentItem.logoPath}`}
                  alt={currentItem.title}
                  className="h-auto max-h-24 w-auto max-w-sm object-contain object-left md:max-h-36 md:max-w-md lg:max-h-44 lg:max-w-lg"
                  style={{
                    filter:
                      "drop-shadow(0 2px 8px rgba(0,0,0,0.5)) drop-shadow(0 0 20px rgba(0,0,0,0.3))",
                  }}
                />
              ) : (
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground drop-shadow-lg md:text-4xl lg:text-5xl">
                  {currentItem.title}
                </h1>
              )}

              {/* Meta badges */}
              <MediaBadges
                type={currentItem.type}
                voteAverage={currentItem.voteAverage}
                year={currentItem.year}
                size="md"
              />

              {currentItem.overview && (
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/70 md:text-base">
                  {currentItem.overview}
                </p>
              )}

              </Link>

              <div className="flex items-center gap-3 pt-1">
                <LibraryButton
                  externalId={currentItem.externalId}
                  provider={currentItem.provider}
                  type={currentItem.type}
                  title={currentItem.title}
                  inLibrary={isInLibrary}
                  redirectOnAdd
                  size="lg"
                  variant="dark"
                />
              </div>
            </div>
          ) : null}

          {/* Spotlight Navigation */}
          {spotlightItems.length > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground/50 hover:text-foreground"
                onClick={prevSpotlight}
              >
                <ChevronLeft size={20} />
              </Button>
              <div className="flex items-center gap-1.5">
                {spotlightItems.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === currentSpotlight
                        ? "w-6 bg-foreground"
                        : "w-2 bg-foreground/30 hover:bg-foreground/50"
                    }`}
                    onClick={() => setCurrentSpotlight(i)}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground/50 hover:text-foreground"
                onClick={nextSpotlight}
              >
                <ChevronRight size={20} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Carousels */}
      <div className="relative -mt-4 flex w-full min-w-0 flex-1 flex-col gap-12 overflow-x-hidden pb-12">
        {myDownloads.length > 0 && (
          <MediaCarousel
            title="My Library"
            seeAllHref="/library"
            items={myDownloads}
            isLoading={downloadedLibrary.isLoading}
          />
        )}

        {recentLibrary.length > 0 && (
          <MediaCarousel
            title="Recently Added"
            seeAllHref="/library"
            items={recentLibrary}
          />
        )}

        <FeaturedCarousel
          title="Recommended for you"
          seeAllHref="/discover?preset=recommended"
          items={(() => {
            const seen = new Set<string>();
            return (recommendations.data?.pages ?? []).flatMap((p) => p.items).filter((r) => {
              const key = `${r.provider}-${r.externalId}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          })()}
          libraryIds={libraryIds}
          isLoading={recommendations.isLoading}
          isFetchingMore={recommendations.isFetchingNextPage}
          onLoadMore={recommendations.hasNextPage ? () => void recommendations.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending TV Shows"
          seeAllHref="/discover?preset=trending_shows"
          items={showItems}
          isLoading={trendingShows.isLoading}
          isFetchingMore={trendingShows.isFetchingNextPage}
          onLoadMore={trendingShows.hasNextPage ? () => void trendingShows.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending Movies"
          seeAllHref="/discover?preset=trending_movies"
          items={movieItems}
          isLoading={trendingMovies.isLoading}
          isFetchingMore={trendingMovies.isFetchingNextPage}
          onLoadMore={trendingMovies.hasNextPage ? () => void trendingMovies.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending Anime"
          seeAllHref="/discover?preset=trending_anime"
          items={animeItems}
          isLoading={trendingAnime.isLoading}
          isFetchingMore={trendingAnime.isFetchingNextPage}
          onLoadMore={trendingAnime.hasNextPage ? () => void trendingAnime.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending Anime Movies"
          seeAllHref="/discover?preset=trending_anime_movies"
          items={animeMovieItems}
          isLoading={animeMovies.isLoading}
          isFetchingMore={animeMovies.isFetchingNextPage}
          onLoadMore={animeMovies.hasNextPage ? () => void animeMovies.fetchNextPage() : undefined}
        />
      </div>
    </div>
  );
}
