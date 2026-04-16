"use client";

import { useMemo } from "react";
import { trpc } from "~/lib/trpc/client";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

interface CollectionSourceProps {
  sectionId: string;
  title: string;
  style: string;
  listId: string;
}

export function CollectionSource({ sectionId, title, style, listId }: CollectionSourceProps): React.JSX.Element | null {
  const { data: lists } = trpc.list.getAll.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const list = lists?.find((l) => l.id === listId);

  const query = trpc.list.getBySlug.useQuery(
    { slug: list?.slug ?? "", limit: 20 },
    { enabled: !!list?.slug },
  );

  const items = useMemo<SectionItem[]>(
    () =>
      (query.data?.items ?? []).map((item) => ({
        externalId: String(item.media.externalId),
        provider: item.media.provider,
        type: item.media.type as "movie" | "show",
        title: item.media.title,
        posterPath: item.media.posterPath ?? null,
        backdropPath: item.media.backdropPath ?? null,
        logoPath: item.media.logoPath ?? null,
        year: item.media.year ?? undefined,
        voteAverage: item.media.voteAverage ?? undefined,
      })),
    [query.data],
  );

  if (!listId) return null;

  return (
    <DynamicSection
      sectionId={sectionId}
      style={style}
      title={title}
      seeAllHref={list ? `/collection/${list.slug}` : undefined}
      items={items}
      isLoading={query.isLoading || !list}
      isError={query.isError}
      onRetry={() => query.refetch()}
    />
  );
}
