"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout } from "~/components/layout/browse-layout";
import { StateMessage } from "~/components/layout/state-message";

interface Preset {
  title: string;
  type: "movie" | "show";
  mediaType: "movie" | "show" | "all";
  mode?: "trending" | "discover";
  genres?: string;
  language?: string;
}

const PRESETS: Record<string, Preset> = {
  trending_shows: {
    title: "Trending TV Shows",
    type: "show",
    mediaType: "show",
  },
  trending_movies: {
    title: "Trending Movies",
    type: "movie",
    mediaType: "movie",
  },
  trending_anime: {
    title: "Trending Anime",
    type: "show",
    mediaType: "show",
    genres: "16",
    language: "ja",
  },
  trending_anime_movies: {
    title: "Trending Anime Movies",
    type: "movie",
    mediaType: "movie",
    mode: "discover",
    genres: "16",
    language: "ja",
  },
};

const DEFAULT_PRESET = "trending_shows";

function RecommendedPage(): React.JSX.Element {
  useEffect(() => {
    document.title = "Recommended for you — Canto";
  }, []);

  const query = trpc.media.recommendations.useInfiniteQuery(
    { pageSize: 20 },
    {
      staleTime: 10 * 60 * 1000,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  const { items, totalResults } = useMemo(() => {
    const allItems = (query.data?.pages ?? []).flatMap((p) => p.items);
    // Deduplicate
    const seen = new Set<number>();
    const deduped = allItems.filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
    return {
      items: deduped.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: r.type,
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
      })),
      totalResults: deduped.length,
    };
  }, [query.data]);

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage();
  }, [query]);

  if (query.isError) {
    return (
      <BrowseLayout
        title="Recommended for you"
        mediaType="all"
        items={[]}
        totalResults={0}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        onFetchNextPage={fetchNextPage}
        emptyState={<StateMessage preset="error" onRetry={() => void query.refetch()} />}
      />
    );
  }

  return (
    <BrowseLayout
      title="Recommended for you"
      mediaType="all"
      items={items}
      totalResults={totalResults}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
      emptyState={<StateMessage preset="emptyGrid" />}
    />
  );
}

function DiscoverPresetPage({ presetKey }: { presetKey: string }): React.JSX.Element {
  const preset = PRESETS[presetKey] ?? PRESETS[DEFAULT_PRESET]!;

  useEffect(() => {
    document.title = `${preset.title} — Canto`;
  }, [preset.title]);

  const query = trpc.media.browse.useInfiniteQuery(
    {
      type: preset.type,
      mode: preset.mode,
      genres: preset.genres,
      language: preset.language,
    },
    {
      staleTime: 10 * 60 * 1000,
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const currentPage = (lastPageParam as number) ?? 1;
        if (currentPage >= lastPage.totalPages) return undefined;
        return currentPage + 1;
      },
      initialCursor: 1,
    },
  );

  const { items, totalResults } = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const results = pages.flatMap((p) =>
      p.results.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: preset.type,
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
        popularity: r.popularity,
        genreIds: r.genreIds as number[] | undefined,
      })),
    );
    const total = pages[0]?.totalResults ?? results.length;
    return { items: results, totalResults: total };
  }, [query.data, preset.type]);

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage();
  }, [query]);

  if (query.isError) {
    return (
      <BrowseLayout
        title={preset.title}
        mediaType={preset.mediaType}
        items={[]}
        totalResults={0}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        onFetchNextPage={fetchNextPage}
        emptyState={<StateMessage preset="error" onRetry={() => void query.refetch()} />}
      />
    );
  }

  return (
    <BrowseLayout
      title={preset.title}
      mediaType={preset.mediaType}
      items={items}
      totalResults={totalResults}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
      emptyState={<StateMessage preset="emptyGrid" />}
    />
  );
}

export default function DiscoverBrowsePage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const presetKey = searchParams.get("preset") ?? DEFAULT_PRESET;

  if (presetKey === "recommended") {
    return <RecommendedPage />;
  }

  return <DiscoverPresetPage presetKey={presetKey} />;
}
