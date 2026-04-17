"use client";

import { useRef } from "react";
import { trpc } from "~/lib/trpc/client";
import { useResponsivePageSize } from "~/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionInfiniteQuery } from "./use-section-query";

interface ContinueWatchingSourceProps {
  sectionId: string;
  title: string;
  style: string;
}

export function ContinueWatchingSource({ sectionId, title, style }: ContinueWatchingSourceProps): React.JSX.Element | null {
  const current = useResponsivePageSize({ mobile: 10, tablet: 16, desktop: 24 });
  const lockedRef = useRef(current);
  const limit = lockedRef.current;

  const query = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit, view: "continue" as const },
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
      seeAllHref="/library/continue-watching"
      excludeFromDedup={true}
    />
  );
}
