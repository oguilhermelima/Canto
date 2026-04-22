"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionInfiniteQuery } from "./use-section-query";

interface RecommendationsSourceProps {
  sectionId: string;
  title: string;
  style: string;
}

export function RecommendationsSource({ sectionId, title, style }: RecommendationsSourceProps): React.JSX.Element | null {
  const utils = trpc.useUtils();
  const recsVersionRef = useRef<number | null>(null);

  const current = useResponsivePageSize({ mobile: 10, tablet: 20, desktop: 30 });
  const lockedRef = useRef(current);
  const pageSize = lockedRef.current;

  const query = trpc.media.recommendations.useInfiniteQuery(
    { pageSize },
    {
      staleTime: 5 * 60 * 1000,
      refetchInterval: 30 * 1000,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  const currentVersion = query.data?.pages[0]?.version;
  useEffect(() => {
    if (currentVersion === undefined) return;
    if (recsVersionRef.current !== null && recsVersionRef.current !== currentVersion) {
      void utils.media.recommendations.invalidate();
    }
    recsVersionRef.current = currentVersion;
  }, [currentVersion, utils.media.recommendations]);

  const result = useSectionInfiniteQuery(
    query,
    (page) => page.items,
    (r): SectionItem => ({
      externalId: r.externalId,
      provider: r.provider,
      type: r.type as "movie" | "show",
      title: r.title,
      posterPath: r.posterPath ?? null,
      backdropPath: r.backdropPath ?? null,
      logoPath: r.logoPath,
      trailerKey: r.trailerKey,
      year: r.year,
      voteAverage: r.voteAverage,
      overview: r.overview,
    }),
    true,
  );

  return (
    <DynamicSection
      {...result}
      sectionId={sectionId}
      style={style}
      title={title}
      seeAllHref="/library/recommendations"
      emptyPreset="emptyWatchlist"
      excludeFromDedup={true}
    />
  );
}
