"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight, Film, Tv, Volume2, VolumeOff } from "lucide-react";
import { AddToListButton } from "~/components/media/add-to-list-button";
import { Skeleton } from "@canto/ui/skeleton";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface FeaturedItem {
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

const TRAILER_DELAY_MS = 800;

export function FeaturedCarousel({
  title,
  items,
  seeAllHref,
  isLoading = false,
  isFetchingMore = false,
  onLoadMore,
  className,
}: FeaturedCarouselProps): React.JSX.Element | null {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
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

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);

    // Load more when near the end
    const nearEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 400;
    if (nearEnd && onLoadMore && !isFetchingMore) {
      onLoadMore();
    }
  }, [onLoadMore, isFetchingMore]);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollBy({
        left: direction === "left" ? -el.clientWidth * 0.6 : el.clientWidth * 0.6,
        behavior: "smooth",
      });
      setTimeout(updateScrollButtons, 350);
    },
    [updateScrollButtons],
  );

  if (!isLoading && items.length === 0) return null;

  return (
    <section className={cn("relative", className)}>
      <div className="mb-0 flex items-center justify-between pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24">
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

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={() => scroll("left")}
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={() => scroll("right")}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex gap-6 overflow-x-auto overflow-y-visible py-2 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
          onMouseLeave={handleMouseLeave}
        >
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="shrink-0 rounded-xl h-[360px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px] w-[200px] sm:w-[220px] lg:w-[260px] 2xl:w-[300px]"
                />
              ))
            : items.map((item, i) => (
                <FeaturedCard
                  key={`${item.provider}-${item.externalId}-${i}`}
                  item={item}
                  isOpen={hoveredIndex === i}
                  onHover={() => handleCardHover(i)}
                />
              ))}
          {isFetchingMore &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={`loading-${i}`}
                className="shrink-0 rounded-xl h-[360px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px] w-[200px] sm:w-[220px] lg:w-[260px] 2xl:w-[300px]"
              />
            ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({
  item,
  isOpen,
  onHover,
}: {
  item: FeaturedItem;
  isOpen: boolean;
  onHover: () => void;
}): React.JSX.Element {
  const [showTrailer, setShowTrailer] = useState(false);
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    onHover();
    if (item.trailerKey) {
      trailerTimerRef.current = setTimeout(() => setShowTrailer(true), TRAILER_DELAY_MS);
    }
  }, [onHover, item.trailerKey]);

  const handleMouseLeave = useCallback(() => {
    if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    trailerTimerRef.current = null;
    setShowTrailer(false);
    setMuted(true);
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: next ? "mute" : "unMute", args: [] }),
      "*",
    );
  }, [muted]);

  const href = `/media/ext?provider=${item.provider}&externalId=${item.externalId}&type=${item.type}`;
  const imgUrl = (path: string, size: string) => path.startsWith("http") ? path : `${TMDB_IMAGE_BASE}/${size}${path}`;
  const posterSrc = item.posterPath ? imgUrl(item.posterPath, "w500") : null;
  const backdropSrc = item.backdropPath ? imgUrl(item.backdropPath, "w780") : null;

  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-xl transition-[width] duration-300 ease-in-out",
        "h-[360px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px]",
        isOpen
          ? "border border-border/40 w-[calc(360px*16/9)] sm:w-[calc(400px*16/9)] lg:w-[calc(440px*16/9)] 2xl:w-[calc(500px*16/9)]"
          : "w-[200px] sm:w-[220px] lg:w-[260px] 2xl:w-[300px]",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Poster — visible when closed */}
      <Link
        href={href}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          isOpen ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {posterSrc ? (
          <Image
            src={posterSrc}
            alt={item.title}
            fill
            className="object-cover"
            loading="lazy"
            sizes="200px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            {item.type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground/20" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground/20" />
            )}
          </div>
        )}
      </Link>

      {/* Backdrop — visible when open */}
      <Link
        href={href}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* Trailer or backdrop */}
        {showTrailer && item.trailerKey ? (
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              ref={iframeRef}
              src={`https://www.youtube-nocookie.com/embed/${item.trailerKey}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${item.trailerKey}&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}`}
              className="pointer-events-none absolute -inset-[60px] h-[calc(100%+120px)] w-[calc(100%+120px)] border-0"
              allow="autoplay; encrypted-media"
              title={`${item.title} trailer`}
            />
          </div>
        ) : backdropSrc ? (
          <Image
            src={backdropSrc}
            alt={item.title}
            fill
            className="object-cover"
            sizes="750px"
          />
        ) : posterSrc ? (
          <Image
            src={posterSrc}
            alt={item.title}
            fill
            className="object-cover blur-sm scale-110"
            sizes="750px"
          />
        ) : null}

        {/* Gradient overlay — less opaque during trailer */}
        <div className={cn(
          "absolute inset-0 transition-opacity duration-500",
          showTrailer ? "bg-gradient-to-t from-black/80 via-transparent to-transparent" : "bg-gradient-to-t from-black/90 via-black/30 to-black/10",
        )} />
        <div className={cn(
          "absolute inset-0 transition-opacity duration-500",
          showTrailer ? "bg-gradient-to-r from-black/40 to-transparent" : "bg-gradient-to-r from-black/50 to-transparent",
        )} />

        {/* Mute button */}
        {showTrailer && item.trailerKey && (
          <button
            type="button"
            onClick={toggleMute}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/70 backdrop-blur-md transition-all hover:scale-105 hover:border-white/40 hover:bg-black/70 hover:text-white"
          >
            {muted ? <VolumeOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        {/* Content over backdrop */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
          {/* Logo or title */}
          {item.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${TMDB_IMAGE_BASE}/w500${item.logoPath}`}
              alt={item.title}
              className="h-auto max-h-20 w-auto max-w-[260px] object-contain object-left"
              style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5)) drop-shadow(0 0 20px rgba(0,0,0,0.3))" }}
            />
          ) : (
            <h3 className="text-lg font-bold text-white drop-shadow-lg">{item.title}</h3>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
            <span>{item.type === "movie" ? "Movie" : "TV Show"}</span>
            {item.voteAverage != null && item.voteAverage > 0 && (
              <>
                <span className="text-white/30">|</span>
                <span className="text-yellow-500">{item.voteAverage.toFixed(1)}</span>
              </>
            )}
            {item.year && (
              <>
                <span className="text-white/30">|</span>
                <span>{item.year}</span>
              </>
            )}
          </div>

          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <AddToListButton
              mediaId={item.id}
              externalId={item.externalId}
              provider={item.provider}
              type={item.type}
              title={item.title}
              size="sm"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}
