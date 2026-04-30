"use client";

import { useEffect, useRef, useState } from "react";
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

const RECS_STALE_MS = 10 * 60 * 1000;
const RECS_VERSION_POLL_MS = 60 * 1000;

export function RecommendationsSource({ sectionId, title, style }: RecommendationsSourceProps): React.JSX.Element | null {
  const utils = trpc.useUtils();
  const recsVersionRef = useRef<number | null>(null);

  const current = useResponsivePageSize({ mobile: 6, tablet: 10, desktop: 15 });
  const [pageSize] = useState(current);

  // Heavy infinite query: paginates the denormalized recommendations read.
  // No `refetchInterval` — invalidation is driven by the lightweight version
  // poll below, which avoids dragging the full page through tRPC every 30s.
  const query = trpc.media.recommendations.useInfiniteQuery(
    { pageSize },
    {
      staleTime: RECS_STALE_MS,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  // Cheap polling endpoint: single SELECT against `user` for
  // `recsVersion` + `recsUpdatedAt`. Bumps trigger an invalidate of the
  // heavy query so React Query refetches on the user's next interaction.
  const versionQuery = trpc.media.recommendationsVersion.useQuery(undefined, {
    refetchInterval: RECS_VERSION_POLL_MS,
    staleTime: RECS_VERSION_POLL_MS,
  });

  const polledVersion = versionQuery.data?.recsVersion;
  useEffect(() => {
    if (polledVersion === undefined) return;
    if (recsVersionRef.current !== null && recsVersionRef.current !== polledVersion) {
      void utils.media.recommendations.invalidate();
    }
    recsVersionRef.current = polledVersion;
  }, [polledVersion, utils.media.recommendations]);

  const result = useSectionInfiniteQuery(
    query,
    (page) => page.items,
    (r): SectionItem => ({
      externalId: r.externalId,
      provider: r.provider,
      type: r.type,
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
