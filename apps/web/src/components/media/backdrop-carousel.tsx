"use client";

import { useMemo } from "react";
import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionTitle } from "~/components/layout/section-title";
import {
  BackdropCard,
  BackdropCardSkeleton
  
} from "./backdrop-card";
import type {BadgeType} from "./backdrop-card";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { useHiddenMedia } from "~/hooks/use-hidden-media";

interface BackdropItem {
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  backdropPath: string | null;
  logoPath?: string | null;
  year?: number | null;
  voteAverage?: number | null;
  popularity?: number | null;
  releaseDate?: string | null;
  badge?: BadgeType | null;
  progress?: { percent: number; value: number; total: number; unit: "seconds" | "episodes" } | null;
}

interface BackdropCarouselProps {
  title: string;
  seeAllHref?: string;
  items: BackdropItem[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
  /** "auto" derives badges from popularity/date/rating. "none" only shows explicit badges. */
  badgeStrategy?: "auto" | "none";
}

function deriveBadge(item: BackdropItem): BadgeType | null {
  if (item.badge) return item.badge;
  if (item.progress) return "continue";
  if (item.popularity && item.popularity > 200) return "trending";
  if (item.releaseDate) {
    const days =
      (Date.now() - new Date(item.releaseDate).getTime()) / 86_400_000;
    if (days >= 0 && days < 60) return "new";
  }
  if (item.voteAverage && item.voteAverage >= 8.0) return "top-rated";
  return null;
}

export function BackdropCarousel({
  title,
  seeAllHref,
  items,
  isLoading = false,
  isFetchingMore = false,
  onLoadMore,
  className,
  badgeStrategy = "none",
}: BackdropCarouselProps): React.JSX.Element | null {
  const { isHidden, hide } = useHiddenMedia();

  const visibleItems = useMemo(
    () => items.filter((item) => !item.externalId || !isHidden(item.externalId, item.provider)),
    [items, isHidden],
  );

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

  if (!isLoading && visibleItems.length === 0) return null;

  return (
    <section className={cn("relative", className)}>
      <SectionTitle title={title} seeMorePath={seeAllHref} />

      {/* Scroll container */}
      <div className="group/carousel relative">
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
          className="flex gap-4 overflow-x-auto overflow-y-visible pt-2 pb-2 pl-4 scrollbar-none md:pt-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <BackdropCardSkeleton
                  key={i}
                  className="w-[280px] shrink-0 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
                />
              ))
            : visibleItems.map((item, i) => (
                <BackdropCard
                  key={`${item.provider}-${item.externalId}-${i}`}
                  {...item}
                  badge={
                    badgeStrategy === "auto" ? deriveBadge(item) : item.badge
                  }
                  onHide={
                    item.externalId
                      ? () =>
                          hide({
                            externalId: item.externalId!,
                            provider: item.provider ?? "tmdb",
                            type: item.type,
                            title: item.title,
                            posterPath: null,
                          })
                      : undefined
                  }
                  className="w-[280px] shrink-0 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
                />
              ))}
          {isFetchingMore &&
            Array.from({ length: 4 }).map((_, i) => (
              <BackdropCardSkeleton
                key={`loading-${i}`}
                className="w-[280px] shrink-0 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
              />
            ))}
          {/* End spacer to match page padding */}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
