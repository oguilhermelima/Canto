"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
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
  className?: string;
}

export function MediaCarousel({
  title,
  seeAllHref,
  items,
  isLoading = false,
  className,
}: MediaCarouselProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

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
      <div className="mb-4 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            See all
          </Link>
        )}
      </div>

      {/* Scroll container */}
      <div className="group relative">
        {/* Left arrow */}
        {canScrollLeft && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 scrollbar-none sm:gap-4 sm:px-6 lg:px-8"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[140px] shrink-0 snap-start sm:w-[160px] lg:w-[180px]"
                />
              ))
            : items.map((item, i) => (
                <MediaCard
                  key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
                  {...item}
                  className="w-[140px] shrink-0 snap-start sm:w-[160px] lg:w-[180px]"
                />
              ))}
        </div>
      </div>
    </section>
  );
}
