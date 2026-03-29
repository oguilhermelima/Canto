"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard, MediaCardSkeleton } from "./media-card";

interface MediaItem {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
}

interface MediaCarouselProps {
  title: string;
  seeAllHref?: string;
  items: MediaItem[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
}

export function MediaCarousel({
  title,
  seeAllHref,
  items,
  isLoading = false,
  isFetchingMore = false,
  onLoadMore,
  className,
}: MediaCarouselProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    const nearEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 300;
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);

    // Trigger load more when near the end
    if (nearEnd && onLoadMore && !isFetchingMore) {
      onLoadMore();
    }
  }, [onLoadMore, isFetchingMore]);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      const scrollAmount = el.clientWidth * 0.8;
      el.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
      setTimeout(updateScrollButtons, 350);
    },
    [updateScrollButtons],
  );

  return (
    <section className={cn("relative", className)}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            See more
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Scroll container */}
      <div className="group/carousel relative">
        {/* Left arrow with gradient */}
        {canScrollLeft && (
          <button
            className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("left")}
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Right arrow with gradient */}
        {canScrollRight && (
          <button
            className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("right")}
          >
            <ChevronRight size={28} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex gap-6 overflow-x-auto overflow-y-visible py-2 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[160px] shrink-0 sm:w-[185px] lg:w-[200px] 2xl:w-[220px]"
                />
              ))
            : items.map((item, i) => (
                <MediaCard
                  key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
                  {...item}
                  showTypeBadge={false}
                  className="w-[160px] shrink-0 sm:w-[185px] lg:w-[200px] 2xl:w-[220px]"
                />
              ))}
          {/* Loading more skeletons */}
          {isFetchingMore &&
            Array.from({ length: 4 }).map((_, i) => (
              <MediaCardSkeleton
                key={`loading-${i}`}
                className="w-[160px] shrink-0 sm:w-[185px] lg:w-[200px] 2xl:w-[220px]"
              />
            ))}
          {/* End spacer to match page padding */}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
