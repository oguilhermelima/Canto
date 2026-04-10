"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Tv,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { mediaHref } from "~/lib/media-href";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { useLogo } from "~/hooks/use-logos";
import { MediaLogo } from "~/components/media/media-logo";
import { cn } from "@canto/ui/cn";

const PAGE_SIZE = 24;
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface UpcomingScheduleItem {
  id: string;
  kind: "upcoming_episode" | "upcoming_movie";
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  fromLists: string[];
  releaseAt: Date | string;
  episode:
    | {
        id: string;
        seasonNumber: number;
        number: number;
        title: string | null;
      }
    | null;
}

function imageUrl(item: UpcomingScheduleItem): string | null {
  const path = item.backdropPath ?? item.posterPath;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/w780${path}`;
}

function formatReleaseLabel(value: Date): string {
  if (Number.isNaN(value.getTime())) return "Soon";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfRelease = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  const diffDays = Math.round(
    (startOfRelease.getTime() - startOfToday.getTime()) / 86_400_000,
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

function UpcomingScheduleCard({
  item,
}: {
  item: UpcomingScheduleItem;
}): React.JSX.Element {
  const releaseDate = new Date(item.releaseAt);
  const releaseLabel = formatReleaseLabel(releaseDate);
  const episodeLabel = item.episode
    ? `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}${item.episode.title ? ` · ${item.episode.title}` : ""}`
    : "Movie release";

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

  return (
    <Link
      href={mediaHref(item.provider, item.externalId, item.mediaType)}
      className="group relative flex w-[280px] shrink-0 overflow-hidden rounded-xl transition-all duration-300 hover:z-10 hover:scale-[1.03] hover:ring-2 hover:ring-foreground/20 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
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
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            {item.mediaType === "show" ? (
              <Tv className="h-10 w-10" />
            ) : (
              <Bookmark className="h-10 w-10" />
            )}
          </div>
        )}

        <div className="absolute right-2.5 top-2.5 rounded-sm bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          {releaseLabel}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-14">
          {logoPath ? (
            <MediaLogo
              src={`${TMDB_IMAGE_BASE}/w500${logoPath}`}
              alt={item.title}
              size="card"
              className="max-w-[70%]"
            />
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
              {item.title}
            </p>
          )}
          <p
            className={cn(
              "line-clamp-2 text-xs text-white/80",
              logoPath ? "mt-2" : "mt-1",
            )}
          >
            {episodeLabel}
          </p>
          <p className="mt-1 text-[11px] text-white/70">
            {releaseDate.toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function UpcomingScheduleSection(): React.JSX.Element {
  return (
    <UpcomingScheduleSectionContent
      title="Upcoming Schedule"
      seeAllHref="/library?tab=collections"
    />
  );
}

export function UpcomingScheduleSectionContent({
  title,
  seeAllHref,
}: {
  title: string;
  seeAllHref?: string;
}): React.JSX.Element {
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.items) ?? []) as UpcomingScheduleItem[],
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
        <div className="mb-0 flex items-center justify-between pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
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
        <div className="mt-4 flex gap-4 overflow-x-auto pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
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
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Failed to load your upcoming schedule.
        </p>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-foreground/80 hover:text-foreground"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        No upcoming releases right now. Add titles to your Watchlist or
        Collections to build a schedule.
      </div>
    );
  }

  return (
    <section className="relative">
      <div className="mb-0 flex items-center justify-between pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
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
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
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
            <UpcomingScheduleCard key={item.id} item={item} />
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
