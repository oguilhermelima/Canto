"use client";

import { useMemo, useCallback } from "react";
import { trpc } from "~/lib/trpc/client";
import type { HomeSectionConfig } from "@canto/db/schema";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

const MAX_CAROUSEL_PAGES = 3;

function buildSearchHref(config: Record<string, unknown>): string {
  const params = new URLSearchParams();

  if (config.type) params.set("type", config.type as string);
  if (config.genres) params.set("genre", config.genres as string);

  if (config.sortBy) params.set("sort", config.sortBy as string);
  else if (config.mode === "trending") params.set("sort", "popularity.desc");

  if (config.language) params.set("language", config.language as string);
  if (config.scoreMin) params.set("score", String(config.scoreMin));
  if (config.runtimeMin) params.set("runtimeMin", String(config.runtimeMin));
  if (config.runtimeMax) params.set("runtimeMax", String(config.runtimeMax));
  if (config.certification) params.set("certification", config.certification as string);
  if (config.status) params.set("status", config.status as string);

  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

interface BrowseSourceProps {
  sectionId: string;
  title: string;
  style: string;
  config: HomeSectionConfig;
}

export function BrowseSource({ sectionId, title, style, config }: BrowseSourceProps): React.JSX.Element | null {
  const c = config as Record<string, unknown>;

  const query = trpc.media.browse.useInfiniteQuery(
    {
      type: (c.type ?? "movie") as "movie" | "show",
      mode: c.mode as "trending" | "discover" | undefined,
      genres: c.genres as string | undefined,
      language: c.language as string | undefined,
      sortBy: c.sortBy as string | undefined,
      dateFrom: c.dateFrom as string | undefined,
      dateTo: c.dateTo as string | undefined,
      keywords: c.keywords as string | undefined,
      scoreMin: c.scoreMin as number | undefined,
      runtimeMin: c.runtimeMin as number | undefined,
      runtimeMax: c.runtimeMax as number | undefined,
      certification: c.certification as string | undefined,
      status: c.status as string | undefined,
      watchProviders: c.watchProviders as string | undefined,
      watchRegion: c.watchRegion as string | undefined,
    },
    {
      staleTime: 10 * 60 * 1000,
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const currentPage = lastPageParam as number;
        if (currentPage >= MAX_CAROUSEL_PAGES || currentPage >= lastPage.totalPages) return undefined;
        return currentPage + 1;
      },
      initialCursor: 1,
    },
  );

  const items = useMemo<SectionItem[]>(
    () =>
      (query.data?.pages.flatMap((p) => p.results) ?? []).map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: r.type as "movie" | "show",
        title: r.title,
        posterPath: r.posterPath ?? null,
        backdropPath: r.backdropPath ?? null,
        logoPath: r.logoPath,
        year: r.year,
        voteAverage: r.voteAverage,
        popularity: r.popularity,
        releaseDate: r.releaseDate,
      })),
    [query.data],
  );

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage) void query.fetchNextPage();
  }, [query]);

  return (
    <DynamicSection
      sectionId={sectionId}
      style={style}
      title={title}
      seeAllHref={buildSearchHref(c)}
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      isFetchingMore={query.isFetchingNextPage}
      onLoadMore={query.hasNextPage ? handleLoadMore : undefined}
      onRetry={() => query.refetch()}
    />
  );
}
