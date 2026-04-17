"use client";

import { useRef } from "react";
import { trpc } from "~/lib/trpc/client";
import { useResponsivePageSize } from "~/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionInfiniteQuery } from "./use-section-query";

interface UserMediaSourceProps {
  sectionId: string;
  title: string;
  style: string;
  filter: { status?: string; isFavorite?: boolean };
}

export function UserMediaSource({ sectionId, title, style, filter }: UserMediaSourceProps): React.JSX.Element | null {
  const current = useResponsivePageSize({ mobile: 10, tablet: 16, desktop: 24 });
  const lockedRef = useRef(current);
  const limit = lockedRef.current;

  const query = trpc.userMedia.getUserMedia.useInfiniteQuery(
    {
      limit,
      status: filter.status as "planned" | "watching" | "completed" | "dropped" | undefined,
      isFavorite: filter.isFavorite,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    {
      getNextPageParam: (lp) => lp.nextCursor ?? undefined,
      initialCursor: 0,
    },
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
    }),
  );

  return (
    <DynamicSection
      {...result}
      sectionId={sectionId}
      style={style}
      title={title}
    />
  );
}
