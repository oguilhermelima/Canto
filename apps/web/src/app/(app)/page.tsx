"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { FeaturedCarousel } from "~/components/media/featured-carousel";
import { AddToListButton } from "~/components/media/add-to-list-button";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface SpotlightItem {
  id?: string | null;
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
    staleTime: 10 * 60 * 1000,
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
  const utils = trpc.useUtils();
  const recsVersionRef = useRef<number | null>(null);
  const recommendations = trpc.media.recommendations.useInfiniteQuery(
    { pageSize: 10 },
    {
      staleTime: 5 * 60 * 1000,
      refetchInterval: 30 * 1000, // light poll every 30s to detect version changes
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  // Invalidate all pages when backend version changes (shadow swap completed)
  const currentRecsVersion = recommendations.data?.pages[0]?.version;
  useEffect(() => {
    if (currentRecsVersion === undefined) return;
    if (recsVersionRef.current !== null && recsVersionRef.current !== currentRecsVersion) {
      void utils.media.recommendations.invalidate();
    }
    recsVersionRef.current = currentRecsVersion;
  }, [currentRecsVersion, utils.media.recommendations]);

  const recentlyAdded = trpc.library.list.useQuery({
    page: 1,
    pageSize: 20,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  // Spotlight from backend
  const spotlightQuery = trpc.provider.spotlight.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });
  const spotlightItems = (spotlightQuery.data ?? []) as SpotlightItem[];
  const loadingSpotlight = spotlightQuery.isLoading;
  const [currentSpotlight, setCurrentSpotlight] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);

  const currentItem = spotlightItems[currentSpotlight];

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

  // Auto-rotate spotlight (paused when popover/sheet is open)
  useEffect(() => {
    if (spotlightPaused || spotlightItems.length <= 1) return;
    const interval = setInterval(nextSpotlight, 15000);
    return () => clearInterval(interval);
  }, [spotlightPaused, spotlightItems.length, nextSpotlight]);

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

  const recentItems = (recentlyAdded.data?.items ?? []).map((item) => ({
    id: item.id,
    type: item.type as "movie" | "show",
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    voteAverage: item.voteAverage,
    href: `/media/${item.id}`,
  }));

  const getPreviewUrl = (item: SpotlightItem): string => {
    if (item.id) return `/media/${item.id}`;
    return `/media/ext?provider=${item.provider}&externalId=${item.externalId}&type=${item.type}`;
  };

  const prefetchSpotlight = useCallback(
    (item: SpotlightItem) => {
      void utils.media.getByExternal.prefetch({
        provider: item.provider as "tmdb" | "anilist" | "tvdb",
        externalId: item.externalId,
        type: item.type,
      });
    },
    [utils],
  );

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
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") prevSpotlight();
            if (e.key === "ArrowRight") nextSpotlight();
          }}
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
              <Link href={getPreviewUrl(currentItem)} onMouseEnter={() => prefetchSpotlight(currentItem)} className="flex flex-col gap-5">
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

              {/* Meta line */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/70">
                <span>{currentItem.type === "movie" ? "Movie" : "TV Show"}</span>
                {currentItem.voteAverage != null && currentItem.voteAverage > 0 && (
                  <>
                    <span className="text-foreground/30">|</span>
                    <span className="text-yellow-500">{currentItem.voteAverage.toFixed(1)}</span>
                  </>
                )}
                {currentItem.year && (
                  <>
                    <span className="text-foreground/30">|</span>
                    <span>{currentItem.year}</span>
                  </>
                )}
              </div>

              {currentItem.overview && (
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/70 md:text-base">
                  {currentItem.overview}
                </p>
              )}

              </Link>

              <div className="flex items-center gap-2 pt-1">
                <AddToListButton
                  externalId={currentItem.externalId}
                  provider={currentItem.provider}
                  type={currentItem.type}
                  title={currentItem.title}
                  size="lg"
                  onOpenChange={setSpotlightPaused}
                />
                <Link
                  href={getPreviewUrl(currentItem)}
                  onMouseEnter={() => prefetchSpotlight(currentItem)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground/15 px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/25"
                >
                  <Info className="h-4 w-4" />
                  More Info
                </Link>
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
                aria-label="Previous"
              >
                <ChevronLeft size={20} />
              </Button>
              <div className="flex items-center gap-1.5">
                {spotlightItems.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
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
                aria-label="Next"
              >
                <ChevronRight size={20} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Carousels */}
      <div className="relative -mt-4 flex w-full min-w-0 flex-1 flex-col gap-12 overflow-x-hidden pb-12">
        {recentItems.length > 0 && (
          <MediaCarousel
            title="Recently Added"
            seeAllHref="/lists/server-library"
            items={recentItems}
            isLoading={recentlyAdded.isLoading}
          />
        )}

        {!recommendations.isLoading && (recommendations.data?.pages ?? []).flatMap((p) => p.items).length === 0 ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Recommended for you</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add items to your watchlist to get personalized recommendations.
            </p>
          </section>
        ) : (
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
            isLoading={recommendations.isLoading}
            isFetchingMore={recommendations.isFetchingNextPage}
            onLoadMore={recommendations.hasNextPage ? () => void recommendations.fetchNextPage() : undefined}
          />
        )}

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
