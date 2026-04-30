"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionInfiniteQuery } from "./use-section-query";

interface ContinueWatchingSourceProps {
  sectionId: string;
  title: string;
  style: string;
}

export function ContinueWatchingSource({ sectionId, title, style }: ContinueWatchingSourceProps): React.JSX.Element | null {
  const current = useResponsivePageSize({ mobile: 6, tablet: 10, desktop: 15 });
  const [limit] = useState(current);

  const query = trpc.userMedia.getContinueWatching.useInfiniteQuery(
    { limit },
    { getNextPageParam: (lp) => lp.nextCursor ?? undefined, initialCursor: null },
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
        item.progressTotal != null
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
      seeAllHref="/library/continue-watching"
      excludeFromDedup={true}
    />
  );
}
