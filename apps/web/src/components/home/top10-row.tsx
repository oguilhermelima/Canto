"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Film, Star, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { SectionTitle } from "@canto/ui/section-title";
import { Skeleton } from "@canto/ui/skeleton";
import { FadeImage } from "@/components/ui/fade-image";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";
import { mediaHref } from "@/lib/media-href";
import { tmdbPosterLoader } from "@/lib/tmdb-image";
import { trpc } from "@/lib/trpc/client";

export interface Top10Item {
  externalId: number;
  provider: "tmdb" | "tvdb";
  type: "movie" | "show";
  title: string;
  posterPath: string | null | undefined;
  year?: number;
  voteAverage?: number | null;
}

interface Top10RowProps {
  title: string;
  items: Top10Item[];
  isLoading?: boolean;
}

const METALLIC_NUMBER_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(180deg, #f5f5f5 0%, #c0c0c0 35%, #6a6a6a 65%, #1a1a1a 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextStroke: "1.5px rgba(255,255,255,0.08)",
  textShadow: "0 6px 24px rgba(0,0,0,0.45)",
};

const CARD_WIDTH_CLASSES = "w-[140px] sm:w-[180px] lg:w-[220px] 2xl:w-[240px]";

function RankNumeral({ rank }: { rank: number }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none inline-block select-none font-black leading-none tracking-tighter italic",
        "text-[120px] sm:text-[170px] lg:text-[230px] 2xl:text-[260px]",
        rank === 10 && "-ml-2 sm:-ml-3 lg:-ml-4",
      )}
      style={METALLIC_NUMBER_STYLE}
    >
      {rank}
    </span>
  );
}

function formatRating(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

interface Top10CardProps {
  item: Top10Item;
  rank: number;
}

function Top10Card({ item, rank }: Top10CardProps): React.JSX.Element {
  const href = mediaHref(item.provider, item.externalId, item.type);
  const utils = trpc.useUtils();
  const [imageReady, setImageReady] = useState(!item.posterPath);
  const typeLabel = item.type === "movie" ? "MOVIE" : "TV SHOW";
  const voteAverage = item.voteAverage;
  const hasRating =
    voteAverage !== null && voteAverage !== undefined && voteAverage > 0;

  const handlePrefetch = useCallback(() => {
    void utils.media.resolve.prefetch({
      provider: item.provider,
      externalId: item.externalId,
      type: item.type,
    });
  }, [item.externalId, item.provider, item.type, utils]);

  return (
    <div
      className="grid shrink-0 grid-cols-[auto_auto] grid-rows-[auto_auto] items-end"
      onMouseEnter={handlePrefetch}
    >
      <Link
        href={href}
        aria-label={`${rank}. ${item.title}`}
        className="col-start-1 row-start-1 flex items-end self-end"
      >
        <RankNumeral rank={rank} />
      </Link>

      <Link
        href={href}
        className={cn(
          "group col-start-2 row-start-1 mt-1 ml-1 md:ml-2",
          CARD_WIDTH_CLASSES,
        )}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-[box-shadow] duration-200 group-hover:ring-2 group-hover:ring-foreground/20">
          {item.posterPath ? (
            <FadeImage
              loader={tmdbPosterLoader}
              src={item.posterPath}
              alt={item.title}
              fill
              className="object-cover"
              fadeDuration={200}
              loading="lazy"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
              onLoad={() => setImageReady(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {item.type === "movie" ? (
                <Film className="h-10 w-10 text-muted-foreground" />
              ) : (
                <Tv className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
          )}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 transition-opacity duration-200",
              imageReady ? "opacity-0" : "opacity-100",
            )}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-xl bg-muted",
                !imageReady && "animate-pulse",
              )}
            />
          </div>
        </div>
      </Link>

      <Link
        href={href}
        className={cn(
          "group col-start-2 row-start-2 ml-1 mt-1.5 flex flex-col gap-1 px-0.5 md:ml-2 md:mt-2 md:gap-1.5",
          CARD_WIDTH_CLASSES,
        )}
      >
        <p className="line-clamp-2 text-xs font-semibold text-foreground transition-colors group-hover:text-primary md:text-sm">
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-medium tracking-wide text-muted-foreground md:text-xs">
          <span>{typeLabel}</span>
          {item.year && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{item.year}</span>
            </>
          )}
        </div>
        {hasRating && (
          <div className="flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground md:text-xs">
            <Star size={12} className="fill-current text-yellow-400" />
            <span className="tabular-nums">{formatRating(voteAverage)}</span>
          </div>
        )}
      </Link>
    </div>
  );
}

function Top10CardSkeleton({ rank }: { rank: number }): React.JSX.Element {
  return (
    <div className="grid shrink-0 grid-cols-[auto_auto] grid-rows-[auto_auto] items-end">
      <div className="col-start-1 row-start-1 flex items-end self-end">
        <RankNumeral rank={rank} />
      </div>
      <div className={cn("col-start-2 row-start-1 mt-1 ml-1 md:ml-2", CARD_WIDTH_CLASSES)}>
        <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      </div>
      <div className={cn("col-start-2 row-start-2 ml-1 mt-1.5 flex flex-col gap-1 px-0.5 md:ml-2 md:mt-2 md:gap-1.5", CARD_WIDTH_CLASSES)}>
        <Skeleton className="h-3 w-3/4 rounded md:h-3.5" />
        <Skeleton className="h-2.5 w-1/2 rounded md:h-3" />
        <Skeleton className="h-2.5 w-2/5 rounded md:h-3" />
      </div>
    </div>
  );
}

export function Top10Row({
  title,
  items,
  isLoading = false,
}: Top10RowProps): React.JSX.Element | null {
  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handleScroll,
  } = useScrollCarousel({ scrollFraction: 0.8 });

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="relative">
      <SectionTitle title={title} />

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-foreground opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-foreground opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollRight}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-1 overflow-x-auto overflow-y-visible pb-4 pl-4 scrollbar-none md:gap-3 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading && items.length === 0
            ? Array.from({ length: 10 }).map((_, i) => (
                <Top10CardSkeleton key={i} rank={i + 1} />
              ))
            : items.slice(0, 10).map((item, i) => (
                <Top10Card
                  key={`${item.provider}-${item.externalId}`}
                  item={item}
                  rank={i + 1}
                />
              ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
