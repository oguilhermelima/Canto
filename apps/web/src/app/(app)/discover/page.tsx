"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout, type FilterOutput } from "~/components/layout/browse-layout";
import { StateMessage } from "~/components/layout/state-message";

interface Preset {
  title: string;
  type: "movie" | "show";
  mode?: "trending" | "discover";
  genres?: string;
  language?: string;
}

const PRESETS: Record<string, Preset> = {
  trending_shows: {
    title: "Trending TV Shows",
    type: "show",
  },
  trending_movies: {
    title: "Trending Movies",
    type: "movie",
  },
  trending_anime: {
    title: "Trending Anime",
    type: "show",
    genres: "16",
    language: "ja",
  },
  trending_anime_movies: {
    title: "Trending Anime Movies",
    type: "movie",
    mode: "discover",
    genres: "16",
    language: "ja",
  },
};

const DEFAULT_PRESET = "trending_shows";

/* ─── Recommended (per-user) ─── */

function RecommendedPage(): React.JSX.Element {
  const [filters, setFilters] = useState<FilterOutput>({});
  const [mediaType, setMediaType] = useState<"movie" | "show" | "all">("all");

  useEffect(() => {
    document.title = "Recommended for you — Canto";
  }, []);

  const queryInput = useMemo(
    () => ({
      pageSize: 20 as const,
      genreIds: filters.genreIds,
      genreMode: filters.genreMode,
      language: filters.language,
      scoreMin: filters.scoreMin,
      yearMin: filters.yearMin,
      yearMax: filters.yearMax,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      certification: filters.certification,
      status: filters.status,
      sortBy: filters.sortBy,
    }),
    [filters],
  );

  const query = trpc.media.recommendations.useInfiniteQuery(queryInput, {
    staleTime: 10 * 60 * 1000,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialCursor: 0,
  });

  const { items, totalResults } = useMemo(() => {
    const allItems = (query.data?.pages ?? []).flatMap((p) => p.items);
    const seen = new Set<number>();
    const deduped = allItems.filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
    const filtered = mediaType === "all"
      ? deduped
      : deduped.filter((r) => r.type === mediaType);
    return {
      items: filtered.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: r.type,
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
      })),
      totalResults: filtered.length,
    };
  }, [query.data, mediaType]);

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage();
  }, [query]);

  if (query.isError) {
    return (
      <BrowseLayout
        title="Recommended for you"
        items={[]}
        totalResults={0}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        onFetchNextPage={fetchNextPage}
        onFilterChange={setFilters}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        emptyState={<StateMessage preset="error" onRetry={() => void query.refetch()} />}
      />
    );
  }

  return (
    <BrowseLayout
      title="Recommended for you"
      items={items}
      totalResults={totalResults}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      emptyState={<StateMessage preset="emptyGrid" />}
    />
  );
}

/* ─── Discover Preset (trending/discover via TMDB) ─── */

function DiscoverPresetPage({ presetKey }: { presetKey: string }): React.JSX.Element {
  const preset = PRESETS[presetKey] ?? PRESETS[DEFAULT_PRESET]!;
  const [filters, setFilters] = useState<FilterOutput>({});
  const [mediaType, setMediaType] = useState<"movie" | "show" | "all">(preset.type);

  useEffect(() => {
    document.title = `${preset.title} — Canto`;
  }, [preset.title]);

  const hasFilters = Object.keys(filters).length > 0;

  const queryInput = useMemo(
    () => ({
      type: mediaType === "all" ? preset.type : mediaType as "movie" | "show",
      mode: (hasFilters || (mediaType !== "all" && mediaType !== preset.type) ? "discover" : (preset.mode ?? "trending")) as "trending" | "discover",
      genres: filters.genres ?? preset.genres,
      language: filters.language ?? preset.language,
      sortBy: filters.sortBy,
      scoreMin: filters.scoreMin,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      certification: filters.certification,
      status: filters.status,
      watchProviders: filters.watchProviders,
      watchRegion: filters.watchRegion,
      dateFrom: filters.yearMin ? `${filters.yearMin}-01-01` : undefined,
      dateTo: filters.yearMax ? `${filters.yearMax}-12-31` : undefined,
    }),
    [preset, filters, hasFilters, mediaType],
  );

  const query = trpc.media.browse.useInfiniteQuery(queryInput, {
    staleTime: 10 * 60 * 1000,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = (lastPageParam as number) ?? 1;
      if (currentPage >= lastPage.totalPages) return undefined;
      return currentPage + 1;
    },
    initialCursor: 1,
  });

  const { items, totalResults } = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const results = pages.flatMap((p) =>
      p.results.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: (r.type ?? preset.type) as "movie" | "show",
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
        popularity: r.popularity,
      })),
    );
    const total = pages[0]?.totalResults ?? results.length;
    return { items: results, totalResults: total };
  }, [query.data, preset.type, mediaType]);

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage();
  }, [query]);

  if (query.isError) {
    return (
      <BrowseLayout
        title={preset.title}
        items={[]}
        totalResults={0}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        onFetchNextPage={fetchNextPage}
        onFilterChange={setFilters}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        emptyState={<StateMessage preset="error" onRetry={() => void query.refetch()} />}
      />
    );
  }

  return (
    <BrowseLayout
      title={preset.title}
      items={items}
      totalResults={totalResults}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      emptyState={<StateMessage preset="emptyGrid" />}
    />
  );
}

/* ─── Page Router ─── */

export default function DiscoverBrowsePage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const presetKey = searchParams.get("preset") ?? DEFAULT_PRESET;

  if (presetKey === "recommended") {
    return <RecommendedPage />;
  }

  return <DiscoverPresetPage presetKey={presetKey} />;
}
