"use client";

import { useMemo } from "react";
import { trpc } from "~/lib/trpc/client";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

interface SpotlightSourceProps {
  style: string;
  title: string;
  isFirstSection?: boolean;
}

export function SpotlightSource({ style, title, isFirstSection }: SpotlightSourceProps): React.JSX.Element {
  const query = trpc.provider.spotlight.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });

  const items = useMemo<SectionItem[]>(
    () =>
      (query.data ?? []).map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          externalId: item.externalId as number,
          provider: item.provider as string,
          type: item.type as "movie" | "show",
          title: item.title as string,
          posterPath: (item.posterPath as string | null) ?? null,
          backdropPath: (item.backdropPath as string | null) ?? null,
          logoPath: (item.logoPath as string | null) ?? null,
          year: item.year as number | undefined,
          voteAverage: item.voteAverage as number | undefined,
          overview: item.overview as string | undefined,
          genres: item.genres as string[] | undefined,
          genreIds: item.genreIds as number[] | undefined,
        };
      }),
    [query.data],
  );

  return (
    <DynamicSection
      style={style}
      title={title}
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => query.refetch()}
      isFirstSection={isFirstSection}
    />
  );
}
