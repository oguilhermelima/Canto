"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";
import { useSectionQuery } from "./use-section-query";

interface CollectionSourceProps {
  sectionId: string;
  title: string;
  style: string;
  listId: string;
}

export function CollectionSource({ sectionId, title, style, listId }: CollectionSourceProps): React.JSX.Element | null {
  const current = useResponsivePageSize({ mobile: 8, tablet: 12, desktop: 18 });
  const [limit] = useState(current);

  const { data: lists } = trpc.list.getAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const list = lists?.find((l) => l.id === listId);

  const query = trpc.list.getBySlug.useQuery(
    { slug: list?.slug ?? "", limit },
    { enabled: !!list?.slug },
  );

  const result = useSectionQuery(
    query,
    (data) => data.items,
    (item): SectionItem => ({
      externalId: String(item.media.externalId),
      provider: item.media.provider,
      type: item.media.type as "movie" | "show",
      title: item.media.title,
      posterPath: item.media.posterPath ?? null,
      backdropPath: item.media.backdropPath ?? null,
      logoPath: item.media.logoPath ?? null,
      year: item.media.year ?? undefined,
      voteAverage: item.media.voteAverage ?? undefined,
    }),
  );

  if (!listId) return null;

  return (
    <DynamicSection
      {...result}
      sectionId={sectionId}
      style={style}
      title={title}
      seeAllHref={list ? `/collection/${list.slug}` : undefined}
      isLoading={result.isLoading || !list}
    />
  );
}
