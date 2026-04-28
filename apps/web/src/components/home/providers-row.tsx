"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { SectionTitle } from "@canto/ui/section-title";
import { trpc } from "@/lib/trpc/client";
import { useWatchRegion } from "@/hooks/use-watch-region";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";

function tmdbImageUrl(path: string, size: "original" | "w500" | "w300" | "w154" = "original"): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function ProviderChip({
  providerIds,
  providerName,
  logoPath,
}: {
  providerIds: number[];
  providerName: string;
  logoPath: string;
}): React.JSX.Element {
  const href = `/search?providers=${providerIds.join(",")}`;
  // `original` is the sharpest TMDB asset — the logos are small static PNGs
  // (typically under ~30 KB each), so the bandwidth cost is negligible and
  // the 112px tile renders crisp on high-DPI displays.
  const src = tmdbImageUrl(logoPath, "original");
  return (
    <Link
      href={href}
      aria-label={providerName}
      title={providerName}
      className={cn(
        "group/chip relative mt-1 block shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-md shadow-black/30 transition duration-200",
        "h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28",
        "hover:ring-white/25 hover:shadow-lg hover:shadow-black/50",
      )}
    >
      <Image
        src={src}
        alt={providerName}
        width={220}
        height={220}
        className="h-full w-full object-cover transition-transform duration-300 group-hover/chip:scale-[1.05]"
        unoptimized
      />
    </Link>
  );
}

export function ProvidersRow({ title }: { title: string }): React.JSX.Element | null {
  const { region } = useWatchRegion();
  const { data, isLoading, isError } = trpc.provider.userWatchProviders.useQuery(
    { region },
    { staleTime: 24 * 60 * 60 * 1000 },
  );

  const {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    handleScroll,
  } = useScrollCarousel({ scrollFraction: 0.9 });

  if (isError) return null;
  if (!isLoading && (!data || data.providers.length === 0)) return null;

  return (
    <section className="relative">
      <SectionTitle title={title} />

      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            aria-label="Scroll left"
            className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background/80 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollLeft}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {canScrollRight && (
          <button
            aria-label="Scroll right"
            className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background/80 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-20"
            onClick={scrollRight}
          >
            <ChevronRight size={22} />
          </button>
        )}

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-5 overflow-x-auto pb-4 pl-4 scrollbar-none md:gap-6 md:pl-8 lg:gap-7 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="mt-1 h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24 lg:h-28 lg:w-28"
                />
              ))
            : data?.providers.map((p) => (
                <ProviderChip
                  key={p.providerId}
                  providerIds={p.providerIds}
                  providerName={p.providerName}
                  logoPath={p.logoPath}
                />
              ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
