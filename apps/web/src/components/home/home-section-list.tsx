"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { HomeSectionRenderer } from "./home-section-renderer";
import { DedupProvider } from "./dedup-context";
import { LazySection } from "./lazy-section";
import type { HomeSectionConfig } from "@canto/db/schema";

function getMinHeightByStyle(style: string): number {
  switch (style) {
    case "large_video":
      return 520;
    case "card":
      return 260;
    case "cover":
      return 400;
    default:
      return 260;
  }
}

interface Section {
  id: string;
  position: number;
  title: string;
  style: string;
  sourceType: string;
  sourceKey: string;
  config: HomeSectionConfig;
  enabled: boolean;
}

interface HomeSectionListProps {
  sections: Section[];
  isLoading?: boolean;
}

export function HomeSectionList({ sections, isLoading = false }: HomeSectionListProps): React.JSX.Element {
  const enabled = sections.filter((s) => s.enabled);
  const firstIsSpotlight = enabled.length > 0
    ? enabled[0]?.style === "spotlight"
    : true; // assume spotlight while loading

  return (
    <DedupProvider>
      <div className="min-h-screen">
        {/* Mobile logo — only when first section is spotlight (it overlaps) */}
        {firstIsSpotlight && (
          <div className="relative z-10 flex h-16 items-center px-4 md:hidden">
            {isLoading ? (
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-5 w-16" />
              </div>
            ) : (
              <Link href="/" className="flex items-center gap-2.5">
                <Image src="/canto.svg" alt="Canto" width={36} height={36} className="h-9 w-9 dark:invert" />
                <span className="text-lg font-bold tracking-tight text-foreground">Canto</span>
              </Link>
            )}
          </div>
        )}

        <div className={cn("pb-8 md:pb-12", firstIsSpotlight && "-mt-16")}>
          {isLoading ? (
            <>
              <SpotlightSkeleton />
              <div className="mt-4 flex flex-col gap-10 md:mt-12 md:gap-14">
                <FeaturedCarouselSkeleton />
                <BackdropCarouselSkeleton />
                <PosterCarouselSkeleton />
              </div>
            </>
          ) : (
            <>
              {/* Spotlight (index 0) renders standalone */}
              {firstIsSpotlight && enabled[0] && (
                <HomeSectionRenderer section={enabled[0]} />
              )}

              {/* All other sections in a uniform-gap container */}
              <div className={cn(
                "flex flex-col gap-10 md:gap-14",
                firstIsSpotlight ? "mt-4 md:mt-12" : "",
              )}>
                {enabled.slice(firstIsSpotlight ? 1 : 0).map((section, i) => (
                  <LazySection
                    key={section.id}
                    id={section.id}
                    minHeight={getMinHeightByStyle(section.style)}
                    eager={i === 0}
                  >
                    <HomeSectionRenderer section={section} />
                  </LazySection>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DedupProvider>
  );
}

/* ── Per-section skeleton fragments ── */

function SpotlightSkeleton(): React.JSX.Element {
  return (
    <div className="relative -mt-16 min-h-[90vh] w-full bg-gradient-to-b from-muted/20 to-background xl:min-h-[80vh]">
      <div className="mx-auto flex min-h-[90vh] w-full flex-col justify-end px-4 pb-16 pt-24 md:px-8 lg:px-12 xl:min-h-[80vh] xl:px-16 2xl:px-24">
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
      </div>
    </div>
  );
}

function FeaturedCarouselSkeleton(): React.JSX.Element {
  return (
    <section>
      <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="flex gap-6 overflow-hidden py-2 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-[360px] w-[230px] shrink-0 rounded-xl sm:h-[400px] sm:w-[250px] lg:h-[440px] lg:w-[280px] 2xl:h-[500px] 2xl:w-[320px]"
          />
        ))}
      </div>
    </section>
  );
}

function BackdropCarouselSkeleton(): React.JSX.Element {
  return (
    <section>
      <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="flex gap-4 overflow-hidden pt-2 pb-2 pl-4 md:pt-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-video w-[280px] shrink-0 rounded-xl sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
          />
        ))}
      </div>
    </section>
  );
}

function PosterCarouselSkeleton(): React.JSX.Element {
  return (
    <section>
      <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="flex gap-3 overflow-hidden pt-2 pb-6 pl-4 md:pt-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-[2/3] w-[140px] shrink-0 rounded-xl sm:w-[160px] lg:w-[180px]"
          />
        ))}
      </div>
    </section>
  );
}

