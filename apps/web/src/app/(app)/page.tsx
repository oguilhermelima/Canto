"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { Star, ChevronLeft, ChevronRight, Info, Plus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { MediaCarousel } from "~/components/media/media-carousel";

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

  const trendingMovies = trpc.media.discover.useInfiniteQuery({ type: "movie" }, infiniteOpts);
  const trendingShows = trpc.media.discover.useInfiniteQuery({ type: "show" }, infiniteOpts);
  const trendingAnime = trpc.media.discover.useInfiniteQuery({ type: "show", genres: "16", language: "ja" }, infiniteOpts);
  const animeMovies = trpc.media.discover.useInfiniteQuery({ type: "movie", mode: "discover", genres: "16", language: "ja" }, infiniteOpts);
  const library = trpc.library.list.useQuery({
    page: 1,
    pageSize: 20,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  // Add to library
  const utils = trpc.useUtils();
  const addToLibrary = trpc.media.addToLibrary.useMutation({
    onSuccess: () => {
      void utils.library.list.invalidate();
      toast.success("Added to library");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // We need getByExternal to persist the media first, then add to library
  // For spotlight items, we call getByExternal which persists, then addToLibrary
  const handleAddToLibrary = useCallback(
    async (item: SpotlightItem) => {
      try {
        // First persist via getByExternal
        const media = await utils.client.media.getByExternal.query({
          provider: item.provider as "tmdb" | "anilist" | "tvdb",
          externalId: item.externalId,
          type: item.type,
        });
        if (media?.id) {
          addToLibrary.mutate({ id: media.id });
        }
      } catch {
        toast.error("Failed to add to library");
      }
    },
    [utils.client.media.getByExternal, addToLibrary],
  );

  // Check if current spotlight item is in library
  const libraryIds = useMemo(() => {
    const items = library.data?.items ?? [];
    return new Set(items.map((i) => `${i.provider}-${i.externalId}`));
  }, [library.data]);

  // Spotlight state
  const [spotlightItems, setSpotlightItems] = useState<SpotlightItem[]>([]);
  const [currentSpotlight, setCurrentSpotlight] = useState(0);
  const [loadingSpotlight, setLoadingSpotlight] = useState(true);

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

  // Build spotlight candidates from trending data
  useEffect(() => {
    if (flatMovies.length === 0 || flatShows.length === 0) return;

    const shows = flatShows.slice(0, 5).map((s) => ({
      ...s,
      externalId: s.externalId,
      type: "show" as const,
    }));
    const movies = flatMovies.slice(0, 5).map((m) => ({
      ...m,
      externalId: m.externalId,
      type: "movie" as const,
    }));

    // Interleave for variety
    const mixed: Array<(typeof shows)[number] | (typeof movies)[number]> = [];
    for (let i = 0; i < 5; i++) {
      const show = shows[i];
      const movie = movies[i];
      if (show) mixed.push(show);
      if (movie) mixed.push(movie);
    }

    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY ?? "";

    // Fetch backdrops + logos in parallel
    Promise.all(
      mixed.slice(0, 10).map(async (item) => {
        const tmdbType = item.type === "show" ? "tv" : "movie";
        try {
          const [detailRes, imagesRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/${tmdbType}/${item.externalId}?api_key=${apiKey}`),
            fetch(`https://api.themoviedb.org/3/${tmdbType}/${item.externalId}/images?api_key=${apiKey}&include_image_language=en,null`),
          ]);

          let backdropPath: string | null = null;
          let logoPath: string | null = null;

          if (detailRes.ok) {
            const data = await detailRes.json();
            backdropPath = data.backdrop_path ?? null;
          }
          if (imagesRes.ok) {
            const images = await imagesRes.json();
            const logos = (images.logos || []).filter(
              (l: { iso_639_1: string | null }) => l.iso_639_1 === "en",
            );
            if (logos.length > 0) {
              logoPath = logos[0].file_path;
            }
          }

          if (!backdropPath) return null;

          return {
            externalId: item.externalId,
            provider: item.provider,
            type: item.type,
            title: item.title,
            overview: item.overview,
            year: item.year,
            voteAverage: item.voteAverage,
            backdropPath,
            logoPath,
          } as SpotlightItem;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      const valid = results.filter((r): r is SpotlightItem => r !== null);
      setSpotlightItems(valid);
      setLoadingSpotlight(false);
    });
  }, [flatMovies, flatShows]);

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
  }));

  const getPreviewUrl = (item: SpotlightItem): string => {
    return `/media/ext?provider=${item.provider}&externalId=${item.externalId}&type=${item.type}`;
  };

  return (
    <div className="min-h-screen">
      {/* Spotlight Hero — extends behind topbar */}
      <div className="spotlight relative -mt-16 min-h-[70vh] w-full">
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
        <div className="relative mx-auto flex min-h-[70vh] w-full flex-col justify-end px-4 pb-16 pt-24 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
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

              {/* Meta row */}
              <div className="flex items-center gap-2.5">
                {currentItem.voteAverage != null &&
                  currentItem.voteAverage > 0 && (
                    <div className="flex items-center gap-1 font-medium text-yellow-400">
                      <Star size={14} fill="currentColor" />
                      {Math.round(currentItem.voteAverage * 10) / 10}
                    </div>
                  )}
                {currentItem.year && (
                  <span className="text-sm text-foreground/60">
                    {currentItem.year}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className="border-foreground/20 text-[10px] uppercase text-foreground/70"
                >
                  {currentItem.type === "show" ? "TV Show" : "Movie"}
                </Badge>
              </div>

              {currentItem.overview && (
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/70 md:text-base">
                  {currentItem.overview}
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="lg"
                  className="rounded-full px-6 font-semibold"
                  asChild
                >
                  <Link href={getPreviewUrl(currentItem)}>
                    <Info size={16} className="mr-2" />
                    More Info
                  </Link>
                </Button>
                {isInLibrary ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full border-green-500/50 text-green-500"
                    title="In Library"
                    disabled
                  >
                    <Check size={18} />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full border-foreground/30"
                    title="Add to Library"
                    disabled={addToLibrary.isPending}
                    onClick={() => currentItem && void handleAddToLibrary(currentItem)}
                  >
                    {addToLibrary.isPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Plus size={18} />
                    )}
                  </Button>
                )}
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
      <div className="relative mt-4 flex w-full min-w-0 flex-1 flex-col gap-12 overflow-x-hidden pb-12">
        {recentLibrary.length > 0 && (
          <MediaCarousel
            title="Recently Added"
            seeAllHref="/library"
            items={recentLibrary}
          />
        )}

        <MediaCarousel
          title="Trending TV Shows"
          seeAllHref="/series"
          items={showItems}
          isLoading={trendingShows.isLoading}
          isFetchingMore={trendingShows.isFetchingNextPage}
          onLoadMore={trendingShows.hasNextPage ? () => void trendingShows.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending Movies"
          seeAllHref="/movies"
          items={movieItems}
          isLoading={trendingMovies.isLoading}
          isFetchingMore={trendingMovies.isFetchingNextPage}
          onLoadMore={trendingMovies.hasNextPage ? () => void trendingMovies.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending Anime"
          seeAllHref="/animes"
          items={animeItems}
          isLoading={trendingAnime.isLoading}
          isFetchingMore={trendingAnime.isFetchingNextPage}
          onLoadMore={trendingAnime.hasNextPage ? () => void trendingAnime.fetchNextPage() : undefined}
        />

        <MediaCarousel
          title="Trending Anime Movies"
          seeAllHref="/anime-movies"
          items={animeMovieItems}
          isLoading={animeMovies.isLoading}
          isFetchingMore={animeMovies.isFetchingNextPage}
          onLoadMore={animeMovies.hasNextPage ? () => void animeMovies.fetchNextPage() : undefined}
        />
      </div>
    </div>
  );
}
