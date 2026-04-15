"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, ChevronLeft, ChevronRight, Loader2, Tv } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { trpc } from "~/lib/trpc/client";
import { mediaHref } from "~/lib/media-href";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { useLogo } from "~/hooks/use-logos";
import { MediaLogo } from "~/components/media/media-logo";
import { SectionTitle } from "~/components/layout/section-title";
import { StateMessage } from "~/components/layout/state-message";
import { cn } from "@canto/ui/cn";

const PAGE_SIZE = 24;
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

type WatchNextView = "continue" | "watch_next";

interface WatchNextItem {
  id: string;
  kind: "continue" | "next_episode" | "next_movie";
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  source: string;
  progressSeconds: number;
  durationSeconds: number | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "seconds" | "episodes" | null;
  watchedAt: Date | null;
  episode:
    | {
        id: string;
        seasonNumber: number | null;
        number: number | null;
        title: string | null;
      }
    | null;
  fromLists: string[];
}

function sourceLabel(source: string): string {
  if (source === "jellyfin") return "Jellyfin";
  if (source === "plex") return "Plex";
  return "Library";
}

function formatProgress(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function imageUrl(item: WatchNextItem): string | null {
  const path = item.backdropPath ?? item.posterPath;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/w780${path}`;
}

function itemLabel(item: WatchNextItem): string {
  if (item.kind === "continue") {
    return item.episode
      ? `S${String(item.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode.number ?? 0).padStart(2, "0")} · ${sourceLabel(item.source)}`
      : `Movie · ${sourceLabel(item.source)}`;
  }

  if (item.kind === "next_episode") {
    return `S${String(item.episode?.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode?.number ?? 0).padStart(2, "0")}${item.episode?.title ? ` · ${item.episode.title}` : ""}`;
  }

  return "Movie to start";
}

function WatchNextCard({
  item,
  view,
}: {
  item: WatchNextItem;
  view: WatchNextView;
}): React.JSX.Element {
  const progressText =
    item.progressUnit === "seconds" &&
    item.progressTotal !== null &&
    item.progressValue !== null
      ? `${formatProgress(item.progressValue)} / ${formatProgress(item.progressTotal)}`
      : item.progressUnit === "episodes" &&
          item.progressTotal !== null &&
          item.progressValue !== null
        ? `${item.progressValue}/${item.progressTotal} episodes watched`
        : null;

  const cardImage = imageUrl(item);
  const logoPath = useLogo(
    item.provider,
    String(item.externalId),
    item.mediaType,
    {
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      year: item.year,
    },
  );
  const [imageReady, setImageReady] = useState(!cardImage);
  const logoResolved = logoPath !== undefined;

  if (!logoResolved || !imageReady) {
    return (
      <div className="relative w-[280px] shrink-0 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        {cardImage && !imageReady && (
          <img
            src={cardImage}
            alt=""
            onLoad={() => setImageReady(true)}
            className="invisible absolute h-0 w-0"
          />
        )}
      </div>
    );
  }

  return (
    <Link
      href={mediaHref(item.provider, item.externalId, item.mediaType)}
      className="group relative flex w-[280px] shrink-0 overflow-hidden rounded-xl animate-in fade-in-0 zoom-in-95 duration-500 ease-out fill-mode-both transition-all hover:z-10 hover:scale-[1.03] hover:ring-2 hover:ring-foreground/20 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {cardImage ? (
          <Image
            src={cardImage}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {item.mediaType === "show" ? (
              <Tv className="h-10 w-10" />
            ) : (
              <Bookmark className="h-10 w-10" />
            )}
          </div>
        )}

        <div className={cn(
          "absolute right-2.5 top-2.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md",
          view === "continue" ? "bg-white/90 text-black" : "bg-sky-500 text-white",
        )}>
          {view === "continue" ? "CONTINUE" : "UP NEXT"}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3.5 pb-3 pt-14">
          {logoPath ? (
            <MediaLogo
              src={`${TMDB_IMAGE_BASE}/w500${logoPath}`}
              alt={item.title}
              size="card"
              className="max-w-[70%]"
            />
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-lg">
              {item.title}
            </p>
          )}
          <div className={cn("flex items-center gap-1.5", logoPath ? "mt-2" : "mt-1.5")}>
            <span className="text-xs font-medium text-white/90">{itemLabel(item)}</span>
          </div>
          {item.progressPercent !== null && (
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white/80"
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-white/70">
                {progressText ?? `${item.progressPercent}%`}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function WatchNextTab({
  view = "watch_next",
  title = "Watch Next",
  seeAllHref,
  mediaType,
}: {
  view?: WatchNextView;
  title?: string;
  seeAllHref?: string;
  mediaType?: "movie" | "show";
}): React.JSX.Element {
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit: PAGE_SIZE, view, mediaType },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items = useMemo(
    () => (data?.pages.flatMap((page) => page.items) ?? []) as WatchNextItem[],
    [data],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handleScroll,
  } = useScrollCarousel({
    onLoadMore: handleFetchNextPage,
    isFetchingMore: isFetchingNextPage,
    loadMoreThreshold: 260,
    scrollFraction: 0.8,
  });

  if (isLoading) {
    return (
      <section className="relative">
        <SectionTitle title={title} seeMorePath={seeAllHref} />
        <div className="mt-2 flex gap-4 overflow-x-auto md:mt-4 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="aspect-video w-[280px] shrink-0 animate-pulse rounded-xl bg-muted sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
            />
          ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="relative">
        <SectionTitle title={title} seeMorePath={seeAllHref} />
        <div className="mt-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <StateMessage preset="error" onRetry={() => void refetch()} minHeight="200px" />
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="relative">
        <SectionTitle title={title} seeMorePath={seeAllHref} />
        <div className="mt-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <StateMessage
            preset={view === "continue" ? "emptyContinueWatching" : "emptyWatchNext"}
            minHeight="200px"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="relative">
      <div className="mb-0 flex items-center justify-between pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24">
        <h2 className="text-base font-semibold text-foreground md:text-xl">{title}</h2>
        {seeAllHref ? (
          <Link
            href={seeAllHref}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            See more
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="group/carousel relative mt-4">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollRight}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto overflow-y-visible pt-1 pb-2 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {items.map((item) => (
            <WatchNextCard key={item.id} item={item} view={view} />
          ))}

          {isFetchingNextPage &&
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={`loading-${i}`}
                className="aspect-video w-[280px] shrink-0 animate-pulse rounded-xl bg-muted sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
              />
            ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>

        {isFetchingNextPage && (
          <div className="mt-2 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </section>
  );
}
