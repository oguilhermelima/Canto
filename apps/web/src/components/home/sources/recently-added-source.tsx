"use client";

import { useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionQuery } from "./use-section-query";

interface RecentlyAddedSourceProps {
  sectionId: string;
  title: string;
  style: string;
}

export function RecentlyAddedSource({ sectionId, title, style }: RecentlyAddedSourceProps): React.JSX.Element | null {
  const current = useResponsivePageSize({ mobile: 8, tablet: 12, desktop: 18 });
  const lockedRef = useRef(current);
  const pageSize = lockedRef.current;

  const query = trpc.library.list.useQuery({
    page: 1,
    pageSize,
    sortBy: "addedAt",
    sortOrder: "desc",
  });

  const result = useSectionQuery(
    query,
    (data) => data.items,
    (item): SectionItem => ({
      externalId: item.externalId,
      provider: item.provider,
      type: item.type as "movie" | "show",
      title: item.title,
      posterPath: item.posterPath ?? null,
      backdropPath: item.backdropPath ?? null,
      logoPath: item.logoPath,
      year: item.year,
      voteAverage: item.voteAverage,
    }),
  );

  return (
    <DynamicSection
      {...result}
      sectionId={sectionId}
      style={style}
      title={title}
      seeAllHref="/collection/server-library"
    />
  );
}
