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
import { tmdbBackdropLoader } from "~/lib/tmdb-image";

function GenreTile({
  id,
  name,
  color,
  backdropPath,
}: {
  id: number;
  name: string;
  color: string;
  backdropPath: string | null;
}): React.JSX.Element {
  return (
    <Link
      href={`/search?genre=${id}`}
      aria-label={`${name} genre`}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl",
        "h-[120px] w-[200px] sm:h-[150px] sm:w-[260px] lg:h-[180px] lg:w-[320px]",
        "ring-1 ring-white/5 transition hover:scale-[1.02] hover:ring-white/20",
      )}
      style={{ backgroundColor: color }}
    >
      {backdropPath ? (
        <Image
          loader={tmdbBackdropLoader}
          src={backdropPath}
          alt=""
          fill
          className="object-cover opacity-70 mix-blend-luminosity"
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 30vw, 22vw"
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${color}dd 0%, ${color}88 60%, ${color}dd 100%)`,
          mixBlendMode: "multiply",
        }}
      />
      <span className="relative z-10 px-3 text-center text-xl font-extrabold leading-tight text-white drop-shadow-md sm:text-2xl lg:text-3xl">
        {name}
      </span>
    </Link>
  );
}

export function GenresRow({ title }: { title: string }): React.JSX.Element | null {
  const { region } = useWatchRegion();
  const { data, isLoading, isError } = trpc.provider.genreTiles.useQuery(
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
                  className="h-[120px] w-[200px] shrink-0 rounded-2xl sm:h-[150px] sm:w-[260px] lg:h-[180px] lg:w-[320px]"
                />
              ))
            : data?.map((g) => (
                <GenreTile
                  key={g.id}
                  id={g.id}
                  name={g.name}
                  color={g.color}
                  backdropPath={g.backdropPath}
                />
              ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}
