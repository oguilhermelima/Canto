"use client";

import { Skeleton } from "@canto/ui/skeleton";
import {
  Eye,
  CheckCircle2,
  Bookmark,
  XCircle,
  Heart,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCard, MediaCardSkeleton } from "~/components/media/media-card";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { mediaHref } from "~/lib/media-href";

const STAT_CARDS = [
  { key: "watching", label: "Watching", icon: Eye },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
  { key: "planned", label: "Planned", icon: Bookmark },
  { key: "dropped", label: "Dropped", icon: XCircle },
  { key: "favorites", label: "Favorites", icon: Heart },
  { key: "rated", label: "Rated", icon: Star },
] as const;

type CountKey = (typeof STAT_CARDS)[number]["key"];

export function OverviewTab(): React.JSX.Element {
  const { data: counts, isLoading: countsLoading } =
    trpc.userMedia.getUserMediaCounts.useQuery();

  return (
    <div className="flex flex-col gap-10">
      {/* Stats Cards */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Stats</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon;
            const value = countsLoading ? undefined : counts?.[card.key as CountKey];

            return (
              <div
                key={card.key}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border p-4"
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                {countsLoading ? (
                  <Skeleton className="h-8 w-10" />
                ) : (
                  <span className="text-2xl font-bold text-foreground">
                    {value ?? 0}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Currently Watching */}
      <WatchingSection />

      {/* Recent Ratings */}
      <RecentRatingsSection />
    </div>
  );
}

function WatchingSection(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    status: "watching",
    limit: 6,
    sortBy: "updatedAt",
  });

  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handleScroll,
  } = useScrollCarousel({ scrollFraction: 0.8 });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  return (
    <section className="relative">
      <h2 className="mb-0 text-lg font-semibold text-foreground">
        Currently Watching
      </h2>

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex"
            onClick={scrollRight}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto overflow-y-visible pt-4 pb-4 scrollbar-none"
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[150px] shrink-0 sm:w-[170px]"
                />
              ))
            : data?.items.map((item) => (
                <MediaCard
                  key={item.mediaId}
                  id={item.mediaId}
                  externalId={String(item.externalId)}
                  provider={item.provider}
                  type={item.mediaType as "movie" | "show"}
                  title={item.title}
                  posterPath={item.posterPath}
                  year={item.year}
                  href={mediaHref(item.provider, item.externalId, item.mediaType)}
                  showTypeBadge
                  showRating={false}
                  showYear={false}
                  showTitle={false}
                  className="w-[150px] shrink-0 sm:w-[170px]"
                />
              ))}
        </div>
      </div>
    </section>
  );
}

function RecentRatingsSection(): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    hasRating: true,
    sortBy: "updatedAt",
    sortOrder: "desc",
    limit: 6,
  });

  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handleScroll,
  } = useScrollCarousel({ scrollFraction: 0.8 });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  return (
    <section className="relative">
      <h2 className="mb-0 text-lg font-semibold text-foreground">
        Recent Ratings
      </h2>

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex"
            onClick={scrollRight}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto overflow-y-visible pt-4 pb-4 scrollbar-none"
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[150px] shrink-0 sm:w-[170px]"
                />
              ))
            : data?.items.map((item) => (
                <div
                  key={item.mediaId}
                  className="relative w-[150px] shrink-0 sm:w-[170px]"
                >
                  <MediaCard
                    id={item.mediaId}
                    externalId={String(item.externalId)}
                    provider={item.provider}
                    type={item.mediaType as "movie" | "show"}
                    title={item.title}
                    posterPath={item.posterPath}
                    year={item.year}
                    href={mediaHref(item.provider, item.externalId, item.mediaType)}
                    showTypeBadge
                    showRating={false}
                    showYear={false}
                    showTitle={false}
                  />
                  <div className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-yellow-400">
                    {item.rating}
                  </div>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
