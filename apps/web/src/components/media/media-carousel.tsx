"use client";

import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionTitle } from "~/components/layout/section-title";
import { MediaCard, MediaCardSkeleton } from "./media-card";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";

interface MediaItem {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
  progress?: { percent: number; value: number; total: number; unit: "seconds" | "episodes" } | null;
}

interface MediaCarouselProps {
  title: string;
  seeAllHref?: string;
  titleAction?: React.ReactNode;
  items: MediaItem[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
}

export function MediaCarousel({
  title,
  seeAllHref,
  titleAction,
  items,
  isLoading = false,
  isFetchingMore = false,
  onLoadMore,
  className,
}: MediaCarouselProps): React.JSX.Element | null {
  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handleScroll,
  } = useScrollCarousel({
    onLoadMore,
    isFetchingMore,
    loadMoreThreshold: 300,
    scrollFraction: 0.8,
  });

  if (!isLoading && items.length === 0) return null;

  return (
    <section className={cn("relative", className)}>
      <SectionTitle title={title} seeMorePath={seeAllHref} action={titleAction} />

      {/* Scroll container */}
      <div className="group/carousel relative">
        {/* Left arrow with gradient */}
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Right arrow with gradient */}
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
          className="flex gap-6 overflow-x-auto overflow-y-visible pt-2 pb-6 pl-4 scrollbar-none md:pt-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[180px] shrink-0 sm:w-[200px] lg:w-[220px] 2xl:w-[240px]"
                />
              ))
            : items.map((item, i) => (
                <MediaCard
                  key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
                  {...item}
                  showTypeBadge
                  showRating={false}
                  showYear={false}
                  showTitle={false}
                  className="w-[180px] shrink-0 sm:w-[200px] lg:w-[220px] 2xl:w-[240px]"
                />
              ))}
          {/* Loading more skeletons */}
          {isFetchingMore &&
            Array.from({ length: 4 }).map((_, i) => (
              <MediaCardSkeleton
                key={`loading-${i}`}
                className="w-[180px] shrink-0 sm:w-[200px] lg:w-[220px] 2xl:w-[240px]"
              />
            ))}
          {/* End spacer to match page padding */}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
