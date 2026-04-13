"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { HomeSectionRenderer } from "./home-section-renderer";
import type { HomeSectionConfig } from "@canto/db/schema";

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
}

export function HomeSectionList({ sections }: HomeSectionListProps): React.JSX.Element {
  const enabled = sections.filter((s) => s.enabled);
  const firstIsSpotlight = enabled[0]?.style === "spotlight";

  return (
    <div className="min-h-screen">
      {/* Mobile logo — only when first section is spotlight (it overlaps) */}
      {firstIsSpotlight && (
        <div className="relative z-10 flex h-16 items-center px-4 md:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/canto.svg" alt="Canto" width={36} height={36} className="h-9 w-9 dark:invert" />
            <span className="text-lg font-bold tracking-tight text-foreground">Canto</span>
          </Link>
        </div>
      )}

      <div className={cn("pb-8 md:pb-12", firstIsSpotlight && "-mt-16")}>
        {enabled.map((section, i) => (
          <div
            key={section.id}
            className={cn(
              i > 0 && (firstIsSpotlight && i === 1 ? "mt-4 md:mt-12" : "mt-8 md:mt-12"),
            )}
          >
            <HomeSectionRenderer section={section} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeSectionListSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-screen">
      <div className="relative z-10 flex h-16 items-center px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
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
          </div>
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="mt-12 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <Skeleton className="mb-4 h-7 w-48" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-48 w-80 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
