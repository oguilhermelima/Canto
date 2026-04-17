"use client";

import { useEffect, useRef } from "react";

interface UseInfiniteScrollOptions {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  rootMargin?: string;
}

export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  rootMargin = "200px",
}: UseInfiniteScrollOptions): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onFetchNextPage();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onFetchNextPage, rootMargin]);

  return sentinelRef;
}
