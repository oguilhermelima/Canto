"use client";

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionTitle } from "@canto/ui/section-title";
import { MediaCard, MediaCardSkeleton } from "./media-card";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";
import { useHiddenMedia } from "@/hooks/use-hidden-media";

function HideMediaButton({
  onClick,
  title,
}: {
  onClick: () => void;
  title: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/70 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 hover:text-white group-hover:opacity-100"
      aria-label={`Hide ${title}`}
    >
      <EyeOff className="h-3.5 w-3.5" />
    </button>
  );
}

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
  icon?: LucideIcon;
  seeAllHref?: string;
  titleAction?: React.ReactNode;
  items: MediaItem[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  /** Set to false to disable auto-hide functionality */
  hideable?: boolean;
  className?: string;
}

export function MediaCarousel({
  title,
  icon,
  seeAllHref,
  titleAction,
  items,
  isLoading = false,
  isFetchingMore = false,
  onLoadMore,
  hideable = true,
  className,
}: MediaCarouselProps): React.JSX.Element | null {
  const { isHidden, hide } = useHiddenMedia();

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

  const visibleItems = useMemo(
    () =>
      hideable
        ? items.filter((item) => !item.externalId || !isHidden(item.externalId, item.provider))
        : items,
    [items, isHidden, hideable],
  );

  if (!isLoading && visibleItems.length === 0) return null;

  return (
    <section className={cn("relative", className)}>
      <SectionTitle title={title} icon={icon} seeMorePath={seeAllHref} action={titleAction} linkAs={Link} />

      {/* Scroll container */}
      <div className="group/carousel relative">
        {/* Left arrow with gradient */}
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Right arrow with gradient */}
        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollRight}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto overflow-y-visible pb-4 pl-4 scrollbar-none md:gap-6 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading && visibleItems.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[140px] shrink-0 animate-pulse sm:w-[180px] lg:w-[220px] 2xl:w-[240px]"
                />
              ))
            : visibleItems.map((item, i) => (
                <MediaCard
                  key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
                  {...item}
                  slots={
                    hideable && item.externalId
                      ? {
                          topLeft: (
                            <HideMediaButton
                              onClick={() =>
                                hide({
                                  externalId: item.externalId!,
                                  provider: item.provider ?? "tmdb",
                                  type: item.type,
                                  title: item.title,
                                  posterPath: item.posterPath,
                                })
                              }
                              title={item.title}
                            />
                          ),
                        }
                      : undefined
                  }
                  className="w-[140px] shrink-0 sm:w-[180px] lg:w-[220px] 2xl:w-[240px]"
                />
              ))}
          {isFetchingMore &&
            Array.from({ length: 4 }).map((_, i) => (
              <MediaCardSkeleton
                key={`loading-${i}`}
                className="w-[140px] shrink-0 animate-pulse sm:w-[180px] lg:w-[220px] 2xl:w-[240px]"
              />
            ))}
          {/* End spacer to match page padding */}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
