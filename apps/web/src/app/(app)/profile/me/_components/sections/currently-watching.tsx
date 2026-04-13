"use client";

import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCard, MediaCardSkeleton } from "~/components/media/media-card";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { mediaHref } from "~/lib/media-href";

export function CurrentlyWatchingBlock({ title: _title }: { title: string }): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    status: "watching",
    limit: 8,
    sortBy: "updatedAt",
  });

  const { containerRef, canScrollLeft, canScrollRight, scrollLeft, scrollRight, handleScroll } =
    useScrollCarousel({ scrollFraction: 0.8 });

  if (!isLoading && (!data?.items || data.items.length === 0)) return null;

  const count = data?.items.length ?? 0;

  return (
    <section className="-mx-5 md:-mx-8 lg:mx-0">
      <div className="px-5 md:px-8 lg:px-5">
        <div className="mb-1 flex items-center gap-2">
          <Play className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-medium tracking-widest text-muted-foreground">CURRENTLY WATCHING</span>
          <span className="text-[10px] text-muted-foreground">· {count}</span>
        </div>
      </div>

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button aria-label="Scroll left" className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex" onClick={scrollLeft}>
            <ChevronLeft size={24} />
          </button>
        )}
        {canScrollRight && (
          <button aria-label="Scroll right" className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/carousel:opacity-100 md:flex" onClick={scrollRight}>
            <ChevronRight size={24} />
          </button>
        )}
        <div ref={containerRef} onScroll={handleScroll} className="flex gap-4 overflow-x-auto overflow-y-visible px-5 pt-2 pb-4 scrollbar-none md:px-8 lg:px-5">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <MediaCardSkeleton key={i} className="w-[150px] shrink-0 sm:w-[170px]" />)
            : data?.items.map((item) => (
                <MediaCard key={item.mediaId} id={item.mediaId} externalId={String(item.externalId)} provider={item.provider} type={item.mediaType as "movie" | "show"} title={item.title} posterPath={item.posterPath} year={item.year} href={mediaHref(item.provider, item.externalId, item.mediaType)} showTypeBadge showRating={false} showYear={false} showTitle={false} className="w-[150px] shrink-0 sm:w-[170px]" />
              ))}
        </div>
      </div>
    </section>
  );
}
