"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { SectionTitle } from "@canto/ui/section-title";
import { StateMessage } from "@canto/ui/state-message";
import type { SPACE_STATES } from "@canto/ui/presets/space-states";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";

type SpaceStateKey = keyof typeof SPACE_STATES;

export interface LibraryCarouselProps<T> {
  title: string;
  icon?: LucideIcon;
  seeAllHref?: string;
  items: T[];
  isLoading: boolean;
  isError: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  onRetry: () => void;
  emptyPreset?: SpaceStateKey;
  renderCard: (item: T) => React.ReactNode;
  cardWidthClass: string;
  aspectRatioClass: string;
  skeletonCount?: number;
  loadMoreThreshold?: number;
  scrollFraction?: number;
}

const SCROLL_CONTAINER_CLASSES =
  "flex gap-3 overflow-x-auto overflow-y-visible pb-4 pl-4 scrollbar-none md:gap-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24";
const END_SPACER_CLASSES = "w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24";

export const LibraryCarousel = <T,>({
  title,
  icon,
  seeAllHref,
  items,
  isLoading,
  isError,
  isFetchingMore = false,
  onLoadMore,
  onRetry,
  emptyPreset,
  renderCard,
  cardWidthClass,
  aspectRatioClass,
  skeletonCount = 5,
  loadMoreThreshold = 260,
  scrollFraction = 0.8,
}: LibraryCarouselProps<T>): React.JSX.Element => {
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
    loadMoreThreshold,
    scrollFraction,
  });

  const skeletonClasses = cn(
    aspectRatioClass,
    cardWidthClass,
    "shrink-0 animate-pulse rounded-xl bg-muted",
  );

  if (isLoading) {
    return (
      <section className="relative">
        <SectionTitle title={title} icon={icon} seeMorePath={seeAllHref} linkAs={Link} />
        <div className={SCROLL_CONTAINER_CLASSES}>
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <div key={index} className={skeletonClasses} />
          ))}
          <div className={END_SPACER_CLASSES} />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="relative">
        <SectionTitle title={title} icon={icon} seeMorePath={seeAllHref} linkAs={Link} />
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <StateMessage preset="error" onRetry={onRetry} minHeight="200px" />
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="relative">
        <SectionTitle title={title} icon={icon} seeMorePath={seeAllHref} linkAs={Link} />
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <StateMessage preset={emptyPreset} minHeight="200px" />
        </div>
      </section>
    );
  }

  return (
    <section className="relative">
      <SectionTitle title={title} icon={icon} seeMorePath={seeAllHref} linkAs={Link} />

      <div className="group/carousel relative">
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
          className={SCROLL_CONTAINER_CLASSES}
        >
          {items.map((item) => renderCard(item))}

          {isFetchingMore &&
            Array.from({ length: 2 }).map((_, i) => (
              <div key={`loading-${i}`} className={skeletonClasses} />
            ))}
          <div className={END_SPACER_CLASSES} />
        </div>

        {isFetchingMore && (
          <div className="mt-2 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </section>
  );
};
