"use client";

import { useRef, useState, useCallback } from "react";

interface UseScrollCarouselOptions {
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
  loadMoreThreshold?: number;
  scrollFraction?: number;
}

interface UseScrollCarouselReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollLeft: () => void;
  scrollRight: () => void;
  handleScroll: () => void;
}

export function useScrollCarousel(
  options?: UseScrollCarouselOptions,
): UseScrollCarouselReturn {
  const {
    onLoadMore,
    isFetchingMore = false,
    loadMoreThreshold = 300,
    scrollFraction = 0.8,
  } = options ?? {};

  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);

    const nearEnd =
      el.scrollLeft >= el.scrollWidth - el.clientWidth - loadMoreThreshold;
    if (nearEnd && onLoadMore && !isFetchingMore) {
      onLoadMore();
    }
  }, [onLoadMore, isFetchingMore, loadMoreThreshold]);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      const el = containerRef.current;
      if (!el) return;
      const amount = el.clientWidth * scrollFraction;
      el.scrollBy({
        left: direction === "left" ? -amount : amount,
        behavior: "smooth",
      });
      let lastScrollLeft = el.scrollLeft;
      const tick = (): void => {
        updateScrollState();
        if (el.scrollLeft !== lastScrollLeft) {
          lastScrollLeft = el.scrollLeft;
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    },
    [updateScrollState, scrollFraction],
  );

  const scrollLeftFn = useCallback(() => scroll("left"), [scroll]);
  const scrollRightFn = useCallback(() => scroll("right"), [scroll]);

  return {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft: scrollLeftFn,
    scrollRight: scrollRightFn,
    handleScroll: updateScrollState,
  };
}
