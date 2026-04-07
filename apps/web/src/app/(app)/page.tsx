"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";
import { FeaturedCarousel } from "~/components/media/featured-carousel";
import { AddToListButton } from "~/components/media/add-to-list-button";
import { StateMessage } from "~/components/layout/state-message";
import { MediaLogo } from "~/components/media/media-logo";
import { mediaHref } from "~/lib/media-href";

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
  genres: string[];
  genreIds: number[];
}

function SpotlightProgressFill({ slideKey }: { slideKey: number }): React.JSX.Element {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setStarted(false);
    // Trigger transition on next frame so the browser sees 0 → 1
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setStarted(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [slideKey]);

  return (
    <div
      className="absolute inset-0 origin-left rounded-full bg-foreground/70 will-change-transform"
      style={{
        transform: `scaleX(${started ? 1 : 0})`,
        transition: started ? "transform 10s linear" : "none",
      }}
    />
  );
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

  // Auto-rotate spotlight — resets on manual slide change
  useEffect(() => {
    if (spotlightPaused || spotlightItems.length <= 1) return;
    const timeout = setTimeout(nextSpotlight, 10000);
    return () => clearTimeout(timeout);
  }, [spotlightPaused, spotlightItems.length, nextSpotlight, currentSpotlight]);

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
    return mediaHref(item.provider, item.externalId, item.type);
  };

  const prefetchSpotlight = useCallback(
    (item: SpotlightItem) => {
      void utils.media.getByExternal.prefetch({
        provider: item.provider as "tmdb" | "tvdb",
        externalId: item.externalId,
        type: item.type,
      });
    },
    [utils],
  );

  return (
    <div className="min-h-screen">
      {/* Mobile logo */}
      <div className="relative z-10 flex h-16 items-center px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/room.png" alt="Canto" className="h-9 w-9 dark:invert" />
          <span className="text-lg font-bold tracking-tight text-foreground">Canto</span>
        </Link>
      </div>

      {/* Spotlight Hero — extends behind topbar */}
      <div className="group/spotlight spotlight relative -mt-16 min-h-[90vh] w-full xl:min-h-[80vh]">
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
        ) : spotlightQuery.isError ? (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
        )}

        {/* Side arrows — visible on hover only */}
        {spotlightItems.length > 1 && (
          <>
            <button
              aria-label="Previous"
              className="absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background/20 text-foreground/60 opacity-0 backdrop-blur-sm transition-all hover:bg-background/40 hover:text-foreground group-hover/spotlight:opacity-100 md:flex lg:left-6"
              onClick={prevSpotlight}
            >
              <ChevronLeft size={28} />
            </button>
            <button
              aria-label="Next"
              className="absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background/20 text-foreground/60 opacity-0 backdrop-blur-sm transition-all hover:bg-background/40 hover:text-foreground group-hover/spotlight:opacity-100 md:flex lg:right-6"
              onClick={nextSpotlight}
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}

        {/* Content */}
        <div
          className="relative mx-auto flex min-h-[90vh] w-full flex-col justify-end px-4 pb-16 pt-24 md:px-8 lg:px-12 xl:min-h-[80vh] xl:px-16 2xl:px-24"
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
          ) : spotlightQuery.isError ? (
            <StateMessage
              preset="error"
              onRetry={() => spotlightQuery.refetch()}
              minHeight="0px"
            />
          ) : currentItem ? (
            <div
              key={currentSpotlight}
              className="flex max-w-2xl flex-col gap-5 animate-[contentSlideIn_0.7s_cubic-bezier(0.16,1,0.3,1)_both_0.2s]"
            >
              <Link href={getPreviewUrl(currentItem)} onMouseEnter={() => prefetchSpotlight(currentItem)} className="flex flex-col gap-5">
              {/* Logo or Title */}
              {currentItem.logoPath ? (
                <MediaLogo src={`${TMDB_IMAGE_BASE}/w780${currentItem.logoPath}`} alt={currentItem.title} size="spotlight" className="max-w-[60vw]" />
              ) : (
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground drop-shadow-lg sm:text-3xl md:text-4xl xl:text-5xl">
                  {currentItem.title}
                </h1>
              )}

              {/* Meta line */}
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/70 sm:text-sm">
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
                {currentItem.genres && currentItem.genres.length > 0 && (
                  <>
                    <span className="text-foreground/30">|</span>
                    {currentItem.genres.map((genre, i) => {
                      const genreId = currentItem.genreIds[i];
                      return (
                        <span key={genre} className="flex items-center gap-x-3">
                          {i > 0 && <span className="text-foreground/30">·</span>}
                          <Link
                            href={`/search${genreId ? `?genre=${genreId}` : ""}`}
                            className="transition-colors hover:text-foreground"
                          >
                            {genre}
                          </Link>
                        </span>
                      );
                    })}
                  </>
                )}
              </div>
              {currentItem.overview && (
                <Link href={getPreviewUrl(currentItem)} onMouseEnter={() => prefetchSpotlight(currentItem)}>
                  <p className="line-clamp-2 text-xs leading-relaxed text-foreground/70 sm:line-clamp-3 sm:text-sm md:text-base">
                    {currentItem.overview}
                  </p>
                </Link>
              )}

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

          {/* Progress indicators */}
          {spotlightItems.length > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                aria-label="Previous"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/40 transition-colors hover:text-foreground md:hidden"
                onClick={prevSpotlight}
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                {spotlightItems.map((_, i) => {
                  const isActive = i === currentSpotlight;
                  const isPast = i < currentSpotlight;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Go to slide ${i + 1}`}
                      className={cn(
                        "relative h-1.5 overflow-hidden rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
                        isActive
                          ? "w-8 bg-foreground/15"
                          : "w-2 bg-foreground/15 hover:bg-foreground/30",
                      )}
                      onClick={() => setCurrentSpotlight(i)}
                    >
                      {isActive ? (
                        <SpotlightProgressFill slideKey={currentSpotlight} />
                      ) : (
                        <div className={cn("absolute inset-0 rounded-full bg-foreground/70", isPast ? "opacity-100" : "opacity-0")} />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                aria-label="Next"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/40 transition-colors hover:text-foreground md:hidden"
                onClick={nextSpotlight}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Carousels */}
      <div className="relative -mt-4 flex w-full min-w-0 flex-1 flex-col gap-12 overflow-x-hidden pb-12">
        {recentlyAdded.isError ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Recently Added</h2>
            <StateMessage preset="error" onRetry={() => recentlyAdded.refetch()} minHeight="200px" />
          </section>
        ) : recentItems.length > 0 ? (
          <MediaCarousel
            title="Recently Added"
            seeAllHref="/lists?tab=server"
            items={recentItems}
            isLoading={recentlyAdded.isLoading}
          />
        ) : null}

        {recommendations.isError ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Recommended for you</h2>
            <StateMessage preset="error" onRetry={() => recommendations.refetch()} minHeight="200px" />
          </section>
        ) : !recommendations.isLoading && (recommendations.data?.pages ?? []).flatMap((p) => p.items).length === 0 ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Recommended for you</h2>
            <StateMessage preset="emptyWatchlist" minHeight="200px" />
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

        {trendingShows.isError ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Trending TV Shows</h2>
            <StateMessage preset="error" onRetry={() => trendingShows.refetch()} minHeight="200px" />
          </section>
        ) : (
          <MediaCarousel
            title="Trending TV Shows"
            seeAllHref="/discover?preset=trending_shows"
            items={showItems}
            isLoading={trendingShows.isLoading}
            isFetchingMore={trendingShows.isFetchingNextPage}
            onLoadMore={trendingShows.hasNextPage ? () => void trendingShows.fetchNextPage() : undefined}
          />
        )}

        {trendingMovies.isError ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Trending Movies</h2>
            <StateMessage preset="error" onRetry={() => trendingMovies.refetch()} minHeight="200px" />
          </section>
        ) : (
          <MediaCarousel
            title="Trending Movies"
            seeAllHref="/discover?preset=trending_movies"
            items={movieItems}
            isLoading={trendingMovies.isLoading}
            isFetchingMore={trendingMovies.isFetchingNextPage}
            onLoadMore={trendingMovies.hasNextPage ? () => void trendingMovies.fetchNextPage() : undefined}
          />
        )}

        {trendingAnime.isError ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Trending Anime</h2>
            <StateMessage preset="error" onRetry={() => trendingAnime.refetch()} minHeight="200px" />
          </section>
        ) : (
          <MediaCarousel
            title="Trending Anime"
            seeAllHref="/discover?preset=trending_anime"
            items={animeItems}
            isLoading={trendingAnime.isLoading}
            isFetchingMore={trendingAnime.isFetchingNextPage}
            onLoadMore={trendingAnime.hasNextPage ? () => void trendingAnime.fetchNextPage() : undefined}
          />
        )}

        {animeMovies.isError ? (
          <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <h2 className="text-xl font-semibold text-foreground">Trending Anime Movies</h2>
            <StateMessage preset="error" onRetry={() => animeMovies.refetch()} minHeight="200px" />
          </section>
        ) : (
          <MediaCarousel
            title="Trending Anime Movies"
            seeAllHref="/discover?preset=trending_anime_movies"
            items={animeMovieItems}
            isLoading={animeMovies.isLoading}
            isFetchingMore={animeMovies.isFetchingNextPage}
            onLoadMore={animeMovies.hasNextPage ? () => void animeMovies.fetchNextPage() : undefined}
          />
        )}
      </div>
    </div>
  );
}
