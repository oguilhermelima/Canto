"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { SectionTitle } from "@canto/ui/section-title";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";

function tmdbImageUrl(path: string, size: "original" | "w300" | "w154" = "original"): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function ProviderChip({
  providerId,
  providerName,
  logoPath,
  brandLogoPath,
}: {
  providerId: number;
  providerName: string;
  logoPath: string;
  brandLogoPath?: string | null;
}): React.JSX.Element {
  const href = `/search?providers=${providerId}`;
  const hasWordmark = Boolean(brandLogoPath);
  const src = brandLogoPath
    ? tmdbImageUrl(brandLogoPath, "original")
    : tmdbImageUrl(logoPath, "w300");
  return (
    <Link
      href={href}
      aria-label={providerName}
      className={cn(
        "group/chip relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl",
        "h-24 w-48 sm:h-28 sm:w-56 lg:h-32 lg:w-64",
        "bg-[#0f172a] ring-1 ring-white/5 transition",
        "hover:scale-[1.02] hover:ring-white/20",
      )}
    >
      <Image
        src={src}
        alt={providerName}
        width={hasWordmark ? 260 : 140}
        height={hasWordmark ? 80 : 80}
        className={cn(
          "h-auto w-auto object-contain transition-transform",
          hasWordmark
            ? "max-h-[60%] max-w-[75%]"
            : "max-h-[62%] max-w-[66%] rounded-lg",
        )}
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
          className="flex gap-3 overflow-x-auto pt-2 pb-4 pl-4 scrollbar-none md:pt-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-24 w-48 shrink-0 rounded-2xl sm:h-28 sm:w-56 lg:h-32 lg:w-64"
                />
              ))
            : data?.providers.map((p) => (
                <ProviderChip
                  key={p.providerId}
                  providerId={p.providerId}
                  providerName={p.providerName}
                  logoPath={p.logoPath}
                  brandLogoPath={p.brandLogoPath}
                />
              ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
