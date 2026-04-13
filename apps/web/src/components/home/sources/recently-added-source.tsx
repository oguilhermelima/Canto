"use client";

import { useMemo } from "react";
import { trpc } from "~/lib/trpc/client";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

interface RecentlyAddedSourceProps {
  title: string;
  style: string;
}

export function RecentlyAddedSource({ title, style }: RecentlyAddedSourceProps): React.JSX.Element | null {
  const query = trpc.library.list.useQuery({
    page: 1,
    pageSize: 20,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  const items = useMemo<SectionItem[]>(
    () =>
      (query.data?.items ?? []).map((item) => ({
        externalId: item.externalId,
        provider: item.provider,
        type: item.type as "movie" | "show",
        title: item.title,
        posterPath: item.posterPath ?? null,
        backdropPath: item.backdropPath ?? null,
        logoPath: item.logoPath,
        year: item.year,
        voteAverage: item.voteAverage,
      })),
    [query.data],
  );

  return (
    <DynamicSection
      style={style}
      title={title}
      seeAllHref="/library/collections"
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => query.refetch()}
    />
  );
}
