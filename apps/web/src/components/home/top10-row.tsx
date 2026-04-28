"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { SectionTitle } from "@canto/ui/section-title";
import { MediaCard, MediaCardSkeleton } from "@/components/media/media-card";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";
import { mediaHref } from "@/lib/media-href";

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

function RankNumeral({ rank }: { rank: number }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none select-none font-black leading-[0.8] tracking-tighter italic",
        "text-[160px] sm:text-[190px] lg:text-[230px] 2xl:text-[260px]",
        rank === 10 && "-ml-2 sm:-ml-3 lg:-ml-4",
      )}
      style={METALLIC_NUMBER_STYLE}
    >
      {rank}
    </span>
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
          className="flex gap-2 overflow-x-auto overflow-y-visible pb-4 pl-4 scrollbar-none md:gap-3 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading && items.length === 0
            ? Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex shrink-0 items-end gap-1 md:gap-2">
                  <div className="h-[260px] w-[100px] sm:h-[300px] sm:w-[120px] lg:h-[330px] lg:w-[140px] 2xl:h-[360px] 2xl:w-[160px]" />
                  <MediaCardSkeleton className="w-[180px] shrink-0 animate-pulse sm:w-[200px] lg:w-[220px] 2xl:w-[240px]" />
                </div>
              ))
            : items.slice(0, 10).map((item, i) => {
                const rank = i + 1;
                const href = mediaHref(item.provider, item.externalId, item.type);
                return (
                  <div
                    key={`${item.provider}-${item.externalId}`}
                    className="flex shrink-0 items-end gap-1 md:gap-2"
                  >
                    <Link
                      href={href}
                      aria-label={`${rank}. ${item.title}`}
                      className="flex items-end"
                    >
                      <RankNumeral rank={rank} />
                    </Link>
                    <div className="w-[180px] shrink-0 sm:w-[200px] lg:w-[220px] 2xl:w-[240px]">
                      <MediaCard
                        externalId={item.externalId}
                        provider={item.provider}
                        type={item.type}
                        title={item.title}
                        posterPath={item.posterPath ?? null}
                        year={item.year}
                        voteAverage={item.voteAverage}
                        href={href}
                      />
                    </div>
                  </div>
                );
              })}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
