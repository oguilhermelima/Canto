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
        <h2 className="text-xl font-semibold text-black">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-black"
          >
            See more &gt;
          </Link>
        )}
      </div>

      {/* Scroll container */}
      <div className="group/carousel relative">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            className="absolute left-2 top-1/3 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 shadow-lg transition-opacity group-hover/carousel:opacity-100 hover:bg-black/70"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <button
            className="absolute right-2 top-1/3 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 shadow-lg transition-opacity group-hover/carousel:opacity-100 hover:bg-black/70"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:px-6 lg:px-8"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <MediaCardSkeleton
                  key={i}
                  className="w-[150px] shrink-0 snap-start sm:w-[170px] lg:w-[185px]"
                />
              ))
            : items.map((item, i) => (
                <MediaCard
                  key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
                  {...item}
                  className="w-[150px] shrink-0 snap-start sm:w-[170px] lg:w-[185px]"
                />
              ))}
        </div>
      </div>
    </section>
  );
}
