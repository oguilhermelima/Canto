"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FadeImage } from "~/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { tmdbBackdropLoader } from "~/lib/tmdb-image";
import { AddToListButton } from "~/components/media/add-to-list-button";
import { StateMessage } from "~/components/layout/state-message";
import { MediaLogo } from "~/components/media/media-logo";
import { mediaHref } from "~/lib/media-href";
import { trpc } from "~/lib/trpc/client";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

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

function SpotlightProgressFill({ slideKey }: { slideKey: number }): React.JSX.Element {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setStarted(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setStarted(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [slideKey]);

  return (
    <div
      className="absolute inset-0 origin-left rounded-full bg-foreground/70 will-change-transform"
      style={{
        transform: `scaleX(${started ? 1 : 0})`,
        transition: started ? "transform 10s linear" : "none",
      }}
    />
  );
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
  const [currentSpotlight, setCurrentSpotlight] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const utils = trpc.useUtils();

  const currentItem = items[currentSpotlight];

  const nextSpotlight = useCallback(() => {
    setSlideDirection(1);
    setCurrentSpotlight((prev) =>
      items.length === 0 ? 0 : (prev + 1) % items.length,
    );
  }, [items.length]);

  const prevSpotlight = useCallback(() => {
    setSlideDirection(-1);
    setCurrentSpotlight((prev) =>
      items.length === 0
        ? 0
        : (prev - 1 + items.length) % items.length,
    );
  }, [items.length]);

  const MAX_DOTS = 5;
  const visibleDots = useMemo(() => {
    const total = items.length;
    if (total <= MAX_DOTS) return items.map((_, i) => i);
    const half = Math.floor(MAX_DOTS / 2);
    const start = Math.max(0, Math.min(currentSpotlight - half, total - MAX_DOTS));
    return Array.from({ length: MAX_DOTS }, (_, i) => start + i);
  }, [items.length, currentSpotlight]);

  const getPreviewUrl = (item: SpotlightItem): string => {
    return mediaHref(item.provider, item.externalId, item.type);
  };

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

  // Auto-rotate
  useEffect(() => {
    if (spotlightPaused || items.length <= 1) return;
    const timeout = setTimeout(nextSpotlight, 10000);
    return () => clearTimeout(timeout);
  }, [spotlightPaused, items.length, nextSpotlight, currentSpotlight]);

  return (
    <div className={cn("group/spotlight spotlight relative min-h-[80vh] w-full overflow-x-clip", className)}>
      {/* Backdrop */}
      {currentItem?.backdropPath ? (
        <div
          key={currentSpotlight}
          className="absolute inset-0 overflow-hidden"
        >
          <FadeImage
            loader={tmdbBackdropLoader}
            src={currentItem.backdropPath}
            alt=""
            fill
            className="object-cover object-center"
            fadeDuration={800}
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background from-5% via-background/40 via-35% to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-background/20 to-transparent" />
        </div>
      ) : isLoading ? (
        <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
      )}

      {/* Side arrows (desktop only) */}
      {items.length > 1 && (
        <>
          <button
            aria-label="Previous"
            className="absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background/20 text-foreground/60 opacity-0 backdrop-blur-sm transition-all hover:bg-background/40 hover:text-foreground group-hover/spotlight:opacity-100 md:flex lg:left-6"
            onClick={prevSpotlight}
          >
            <ChevronLeft size={28} />
          </button>
          <button
            aria-label="Next"
            className="absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background/20 text-foreground/60 opacity-0 backdrop-blur-sm transition-all hover:bg-background/40 hover:text-foreground group-hover/spotlight:opacity-100 md:flex lg:right-6"
            onClick={nextSpotlight}
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}

      {/* Content */}
      <div
        className="relative mx-auto flex min-h-[80vh] w-full flex-col justify-end px-4 pb-8 pt-24 md:px-8 lg:px-12 xl:px-16 2xl:px-24"
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
          if (Math.abs(diff) > 50 && items.length > 1) {
            if (diff > 0) {
              setSlideDirection(1);
              setCurrentSpotlight((p) => (p + 1) % items.length);
            } else {
              setSlideDirection(-1);
              setCurrentSpotlight((p) => (p - 1 + items.length) % items.length);
            }
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
          <StateMessage
            preset="error"
            onRetry={onRetry}
            minHeight="0px"
          />
        ) : currentItem ? (
          <div
            key={currentSpotlight}
            className="flex max-w-2xl flex-col gap-5 animate-[contentSlideIn_0.6s_cubic-bezier(0.16,1,0.3,1)_both_0.1s]"
            style={{ "--slide-from": `${slideDirection * 40}px` } as React.CSSProperties}
          >
            <Link href={getPreviewUrl(currentItem)} onMouseEnter={() => prefetchSpotlight(currentItem)} className="flex flex-col gap-5">
              {currentItem.logoPath ? (
                <MediaLogo src={`${TMDB_IMAGE_BASE}/w780${currentItem.logoPath}`} alt={currentItem.title} size="spotlight" className="max-w-[60vw]" />
              ) : (
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground drop-shadow-lg sm:text-3xl md:text-4xl xl:text-5xl">
                  {currentItem.title}
                </h1>
              )}
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/70 sm:text-sm">
              <span>{currentItem.type === "movie" ? "Movie" : "TV Show"}</span>
              {currentItem.voteAverage != null && currentItem.voteAverage > 0 && (
                <>
                  <span className="text-foreground/30">|</span>
                  <span className="text-yellow-400">{currentItem.voteAverage.toFixed(1)}</span>
                </>
              )}
              {currentItem.year && (
                <>
                  <span className="text-foreground/30">|</span>
                  <span>{currentItem.year}</span>
                </>
              )}
              {currentItem.genres.length > 0 && (
                <>
                  <span className="text-foreground/30">|</span>
                  {currentItem.genres.map((genre, i) => {
                    const genreId = currentItem.genreIds[i];
                    return (
                      <span key={genre} className="flex items-center gap-x-3">
                        {i > 0 && <span className="text-foreground/30">·</span>}
                        <Link
                          href={`/search${genreId ? `?genre=${genreId}` : ""}`}
                          className="transition-colors hover:text-foreground"
                        >
                          {genre}
                        </Link>
                      </span>
                    );
                  })}
                </>
              )}
            </div>
            {currentItem.overview && (
              <Link href={getPreviewUrl(currentItem)} onMouseEnter={() => prefetchSpotlight(currentItem)}>
                <p className="line-clamp-2 text-xs leading-relaxed text-foreground/70 sm:line-clamp-3 sm:text-sm md:text-base">
                  {currentItem.overview}
                </p>
              </Link>
            )}

            <div className="flex items-center gap-2 pt-1">
              <AddToListButton
                externalId={currentItem.externalId}
                provider={currentItem.provider}
                type={currentItem.type}
                title={currentItem.title}
                size="lg"
                onOpenChange={setSpotlightPaused}
              />
              <Link
                href={getPreviewUrl(currentItem)}
                onMouseEnter={() => prefetchSpotlight(currentItem)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground/15 px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/25"
              >
                <Info className="h-4 w-4" />
                More Info
              </Link>
            </div>
          </div>
        ) : null}

        {/* Progress indicators */}
        {items.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1.5 md:absolute md:inset-x-0 md:bottom-[3.1rem] md:mt-0">
            {visibleDots.map((dotIndex) => {
              const isActive = dotIndex === currentSpotlight;
              const isPast = dotIndex < currentSpotlight;
              const isEdge =
                items.length > MAX_DOTS &&
                ((dotIndex === visibleDots[0] && dotIndex > 0) ||
                  (dotIndex === visibleDots[visibleDots.length - 1] &&
                    dotIndex < items.length - 1));

              return (
                <button
                  key={dotIndex}
                  type="button"
                  aria-label={`Go to slide ${dotIndex + 1}`}
                  className={cn(
                    "relative overflow-hidden rounded-full transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
                    isActive
                      ? "h-1.5 w-8 bg-foreground/15"
                      : "h-1.5 w-1.5 bg-foreground/15 hover:bg-foreground/30",
                    isEdge && "scale-75 opacity-50",
                  )}
                  onClick={() => {
                    setSlideDirection(dotIndex > currentSpotlight ? 1 : -1);
                    setCurrentSpotlight(dotIndex);
                  }}
                >
                  {isActive ? (
                    <SpotlightProgressFill slideKey={currentSpotlight} />
                  ) : (
                    <div
                      className={cn(
                        "absolute inset-0 rounded-full bg-foreground/70",
                        isPast ? "opacity-100" : "opacity-0",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
