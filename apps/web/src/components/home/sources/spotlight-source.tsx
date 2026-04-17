"use client";

import { trpc } from "~/lib/trpc/client";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionQuery } from "./use-section-query";

interface SpotlightSourceProps {
  sectionId: string;
  style: string;
  title: string;
}

export function SpotlightSource({ sectionId, style, title }: SpotlightSourceProps): React.JSX.Element {
  const query = trpc.provider.spotlight.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });

  const result = useSectionQuery(
    query,
    (data) => data as Record<string, unknown>[],
    (item): SectionItem => ({
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
    }),
  );

  return (
    <DynamicSection
      {...result}
      sectionId={sectionId}
      style={style}
      title={title}
      excludeFromDedup={true}
    />
  );
}
