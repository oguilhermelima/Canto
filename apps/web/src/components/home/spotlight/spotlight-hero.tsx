"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { StateMessage } from "@canto/ui/state-message";
import { useHiddenMedia } from "@/hooks/use-hidden-media";
import { trpc } from "@/lib/trpc/client";
import { SpotlightBackdrop } from "./spotlight-backdrop";
import { SpotlightContent } from "./spotlight-content";
import { SpotlightNavigation } from "./spotlight-navigation";
import { SpotlightProgressDots } from "./spotlight-progress-dots";

export interface SpotlightItem {
  id?: string | null;
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  overview: string | undefined;
  year: number | undefined;
  voteAverage: number | undefined;
  backdropPath: string;
  logoPath: string | null;
  genres: string[];
  genreIds: number[];
}

interface SpotlightHeroProps {
  items: SpotlightItem[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function SpotlightHero({
  items,
  isLoading,
  isError = false,
  onRetry,
  className,
}: SpotlightHeroProps): React.JSX.Element {
  const { isHidden: isMediaHidden } = useHiddenMedia();
  const visibleItems = useMemo(
    () => items.filter((item) => !isMediaHidden(item.externalId, item.provider)),
    [items, isMediaHidden],
  );

  const [currentSpotlight, setCurrentSpotlight] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const utils = trpc.useUtils();

  const currentItem = visibleItems[currentSpotlight];

  const nextSpotlight = useCallback(() => {
    setSlideDirection(1);
    setCurrentSpotlight((prev) =>
      visibleItems.length === 0 ? 0 : (prev + 1) % visibleItems.length,
    );
  }, [visibleItems.length]);

  const prevSpotlight = useCallback(() => {
    setSlideDirection(-1);
    setCurrentSpotlight((prev) =>
      visibleItems.length === 0
        ? 0
        : (prev - 1 + visibleItems.length) % visibleItems.length,
    );
  }, [visibleItems.length]);

  const prefetchSpotlight = useCallback(
    (item: SpotlightItem) => {
      void utils.media.getByExternal.prefetch({
        provider: item.provider as "tmdb" | "tvdb",
        externalId: item.externalId,
        type: item.type,
      });
    },
    [utils],
  );

  useEffect(() => {
    if (spotlightPaused || visibleItems.length <= 1) return;
    const timeout = setTimeout(nextSpotlight, 10000);
    return () => clearTimeout(timeout);
  }, [spotlightPaused, visibleItems.length, nextSpotlight, currentSpotlight]);

  return (
    <div
      className={cn(
        "group/spotlight spotlight relative min-h-[90vh] md:min-h-[80vh] w-full overflow-x-clip",
        className,
      )}
    >
      <SpotlightBackdrop
        item={currentItem ?? null}
        slideKey={currentSpotlight}
        isLoading={isLoading}
      />

      <SpotlightNavigation
        onPrev={prevSpotlight}
        onNext={nextSpotlight}
        enabled={visibleItems.length > 1}
      />

      <div
        className="relative mx-auto flex min-h-[90vh] md:min-h-[80vh] w-full flex-col justify-end px-4 pb-8 pt-24 md:px-8 lg:px-12 xl:px-16 2xl:px-24"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") prevSpotlight();
          if (e.key === "ArrowRight") nextSpotlight();
        }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) (e.currentTarget as HTMLElement).dataset.touchX = String(touch.clientX);
        }}
        onTouchEnd={(e) => {
          const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? "0");
          const endX = e.changedTouches[0]?.clientX ?? 0;
          const diff = startX - endX;
          if (Math.abs(diff) > 50 && visibleItems.length > 1) {
            if (diff > 0) nextSpotlight();
            else prevSpotlight();
          }
        }}
      >
        {isLoading ? (
          <div className="flex max-w-2xl flex-col gap-5">
            <Skeleton className="h-24 w-96 max-w-full bg-foreground/10" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-14 bg-foreground/10" />
              <Skeleton className="h-5 w-12 bg-foreground/10" />
              <Skeleton className="h-5 w-20 bg-foreground/10" />
            </div>
            <Skeleton className="h-16 w-full max-w-2xl bg-foreground/10" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-36 rounded-full bg-foreground/10" />
              <Skeleton className="h-10 w-10 rounded-full bg-foreground/10" />
            </div>
          </div>
        ) : isError ? (
          <StateMessage preset="error" onRetry={onRetry} minHeight="0px" />
        ) : currentItem ? (
          <SpotlightContent
            key={currentSpotlight}
            item={currentItem}
            slideDirection={slideDirection}
            onPausedChange={setSpotlightPaused}
            onPrefetch={prefetchSpotlight}
            actionsTrailing={
              visibleItems.length > 1 ? (
                <SpotlightProgressDots
                  total={visibleItems.length}
                  current={currentSpotlight}
                  onSelect={(i) => {
                    setSlideDirection(i > currentSpotlight ? 1 : -1);
                    setCurrentSpotlight(i);
                  }}
                />
              ) : null
            }
          />
        ) : null}
      </div>
    </div>
  );
}
