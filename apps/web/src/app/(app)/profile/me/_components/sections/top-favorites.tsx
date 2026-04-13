"use client";

import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@canto/ui/skeleton";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbBackdropLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";

const TMDB_LOGO = "https://image.tmdb.org/t/p/w300";

export function TopFavoritesBlock({ title: _title }: { title: string }): React.JSX.Element | null {
  const { data, isLoading } = trpc.userMedia.getUserMedia.useQuery({
    isFavorite: true,
    limit: 10,
    sortBy: "rating",
    sortOrder: "desc",
  });

  const { containerRef, canScrollLeft, canScrollRight, scrollLeft, scrollRight, handleScroll } =
    useScrollCarousel({ scrollFraction: 0.8 });

  // Sort: rated items first (highest first), unrated last
  const sorted = [...(data?.items ?? [])].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  if (!isLoading && sorted.length === 0) return null;

  const count = data?.total ?? 0;

  return (
    <section className="-mx-5 md:-mx-8 lg:mx-0">
      <div className="px-5 md:px-8 lg:px-5">
        <div className="mb-1 flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-medium tracking-widest text-muted-foreground">HALL OF FAME</span>
          <span className="text-[10px] text-muted-foreground">· {count}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 px-5 md:px-8 lg:px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-64 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
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
          <div ref={containerRef} onScroll={handleScroll} className="flex gap-3 overflow-x-auto px-5 pt-2 pb-4 scrollbar-none md:px-8 lg:px-5">
            {sorted.map((item) => (
              <Link
                key={item.mediaId}
                href={mediaHref(item.provider, item.externalId, item.mediaType)}
                className="group relative aspect-video w-80 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-[360px]"
              >
                {item.backdropPath ? (
                  <Image
                    src={item.backdropPath}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    loader={tmdbBackdropLoader}
                    sizes="256px"
                  />
                ) : item.posterPath ? (
                  <Image
                    src={item.posterPath}
                    alt={item.title}
                    fill
                    className="object-cover blur-sm"
                    loader={tmdbBackdropLoader}
                    sizes="256px"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end p-3">
                  {item.logoPath ? (
                    <img
                      src={`${TMDB_LOGO}${item.logoPath}`}
                      alt={item.title}
                      className="max-h-8 max-w-[70%] object-contain drop-shadow-lg"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-white drop-shadow-lg">{item.title}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
