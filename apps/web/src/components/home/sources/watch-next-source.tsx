"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionInfiniteQuery } from "./use-section-query";

interface WatchNextSourceProps {
  sectionId: string;
  title: string;
  style: string;
}

export function WatchNextSource({ sectionId, title, style }: WatchNextSourceProps): React.JSX.Element | null {
  const initialLimit = useResponsivePageSize({ mobile: 10, tablet: 16, desktop: 24 });
  const [limit] = useState(initialLimit);

  const query = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit, view: "watch_next" as const },
    { getNextPageParam: (lp) => lp.nextCursor, initialCursor: 0 },
  );

  const result = useSectionInfiniteQuery(
    query,
    (page) => page.items,
    (item): SectionItem => ({
      externalId: item.externalId,
      provider: item.provider,
      type: item.mediaType as "movie" | "show",
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      logoPath: item.logoPath,
      trailerKey: item.trailerKey,
      overview: item.overview,
      voteAverage: item.voteAverage,
      genres: (item.genres as string[] | null) ?? undefined,
      genreIds: (item.genreIds as number[] | null) ?? undefined,
      year: item.year,
      progress:
        item.progressPercent != null &&
        item.progressValue != null &&
        item.progressTotal != null &&
        item.progressUnit != null
          ? {
              percent: item.progressPercent,
              value: item.progressValue,
              total: item.progressTotal,
              unit: item.progressUnit,
            }
          : null,
    }),
  );

  return (
    <DynamicSection
      {...result}
      sectionId={sectionId}
      style={style}
      title={title}
      seeAllHref="/library/watch-next"
    />
  );
}
