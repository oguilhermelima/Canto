"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionTitle } from "@canto/ui/section-title";
import { Skeleton } from "@canto/ui/skeleton";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";
import { useHiddenMedia } from "@/hooks/use-hidden-media";
import { FeaturedCard } from "@/components/media/cards/featured-card";

export { FeaturedCard } from "@/components/media/cards/featured-card";

export interface FeaturedItem {
  id?: string;
  externalId: number | string;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath?: string | null;
  trailerKey?: string | null;
  year?: number | null;
  voteAverage?: number | null;
  overview?: string | null;
}

interface FeaturedCarouselProps {
  title: string;
  seeAllHref?: string;
  items: FeaturedItem[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
}

export function FeaturedCarousel({
  title,
  items,
  seeAllHref,
  isLoading = false,
  isFetchingMore = false,
  onLoadMore,
  className,
}: FeaturedCarouselProps): React.JSX.Element | null {
  const { isHidden, hide } = useHiddenMedia();

  const visibleItems = useMemo(
    () => items.filter((item) => !isHidden(item.externalId, item.provider)),
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
    loadMoreThreshold: 400,
    scrollFraction: 0.6,
  });

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCardHover = useCallback((index: number) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredIndex(index), 150);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoveredIndex(null);
  }, []);

  if (!isLoading && visibleItems.length === 0) return null;

  return (
    <section className={cn("relative", className)}>
      <SectionTitle title={title} seeMorePath={seeAllHref} linkAs={Link} />

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}

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
          className="flex gap-6 overflow-x-auto overflow-y-visible py-2 pl-4 [contain:paint] scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
          onMouseLeave={handleMouseLeave}
        >
          {isLoading && visibleItems.length === 0
            ? Array.from({ length: 12 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="shrink-0 rounded-xl animate-pulse h-[360px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px] w-[230px] sm:w-[250px] lg:w-[280px] 2xl:w-[320px]"
                />
              ))
            : visibleItems.map((item, i) => (
                <FeaturedCard
                  key={`${item.provider}-${item.externalId}-${i}`}
                  item={item}
                  index={i}
                  isOpen={hoveredIndex === i}
                  onHover={() => handleCardHover(i)}
                  onHide={() =>
                    hide({
                      externalId: item.externalId,
                      provider: item.provider,
                      type: item.type,
                      title: item.title,
                      posterPath: item.posterPath,
                    })
                  }
                />
              ))}
          {isFetchingMore &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={`loading-${i}`}
                className="shrink-0 rounded-xl animate-pulse h-[360px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px] w-[230px] sm:w-[250px] lg:w-[280px] 2xl:w-[320px]"
              />
            ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
