import { useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import type { FilterOutput } from "@/components/layout/browse-layout";

interface UseSearchQueriesInput {
  query: string;
  searchType: "multi" | "movie" | "show";
  filters: FilterOutput;
}

interface MediaItem {
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year: number | undefined;
  voteAverage: number | undefined;
  popularity?: number | null;
}

interface UseSearchQueriesOutput {
  items: MediaItem[];
  totalResults: number;
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetchAll: () => void;
}

const pageParam = {
  getNextPageParam: (
    lastPage: { totalPages: number },
    _allPages: unknown[],
    lastPageParam: unknown,
  ) => {
    const currentPage = lastPageParam as number;
    if (currentPage >= lastPage.totalPages) return undefined;
    return currentPage + 1;
  },
  initialCursor: 1,
};

export function useSearchQueries({
  query,
  searchType,
  filters,
}: UseSearchQueriesInput): UseSearchQueriesOutput {
  const isSearching = query.length >= 2;
  const hasFilters = Object.keys(filters).length > 0;

  // All discover-compatible filter params (shared by search+filters and browse)
  const allFilters = {
    query: isSearching ? query : undefined,
    genres: filters.genres,
    language: filters.language,
    sortBy: filters.sortBy,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
    runtimeMin: filters.runtimeMin,
    runtimeMax: filters.runtimeMax,
    certification: filters.certification,
    status: filters.status,
    watchProviders: filters.watchProviders,
    watchRegion: filters.watchRegion,
    dateFrom: filters.yearMin ? `${filters.yearMin}-01-01` : undefined,
    dateTo: filters.yearMax ? `${filters.yearMax}-12-31` : undefined,
  };

  // When searching with filters → discover + with_text_query (all filters work)
  // When searching without filters → plain search (better relevance)
  // When browsing → trending or discover
  const searchMode = isSearching
    ? hasFilters ? "discover" as const : "search" as const
    : hasFilters ? "discover" as const : "trending" as const;

  /* ─── Search queries (when typing) ─── */

  const singleQuery = trpc.media.browse.useInfiniteQuery(
    { mode: searchMode, type: searchType === "multi" ? "movie" : searchType, provider: "tmdb", ...allFilters },
    { enabled: isSearching && searchType !== "multi", ...pageParam },
  );

  const multiMovieQuery = trpc.media.browse.useInfiniteQuery(
    { mode: searchMode, type: "movie", provider: "tmdb", ...allFilters },
    { enabled: isSearching && searchType === "multi", ...pageParam },
  );

  const multiShowQuery = trpc.media.browse.useInfiniteQuery(
    { mode: searchMode, type: "show", provider: "tmdb", ...allFilters },
    { enabled: isSearching && searchType === "multi", ...pageParam },
  );

  /* ─── Trending/Discover queries (default, no search) ─── */

  const browseMode = hasFilters ? "discover" as const : "trending" as const;

  const trendingMovies = trpc.media.browse.useInfiniteQuery(
    { mode: browseMode, type: "movie", ...allFilters },
    { enabled: !isSearching && searchType !== "show", staleTime: 10 * 60 * 1000, ...pageParam },
  );

  const trendingShows = trpc.media.browse.useInfiniteQuery(
    { mode: browseMode, type: "show", ...allFilters },
    { enabled: !isSearching && searchType !== "movie", staleTime: 10 * 60 * 1000, ...pageParam },
  );

  /* ─── Derived state ─── */

  const isError = isSearching
    ? searchType === "multi"
      ? multiMovieQuery.isError || multiShowQuery.isError
      : singleQuery.isError
    : searchType === "multi"
      ? trendingMovies.isError || trendingShows.isError
      : searchType === "movie"
        ? trendingMovies.isError
        : trendingShows.isError;

  const isLoading = isSearching
    ? searchType === "multi"
      ? multiMovieQuery.isLoading || multiShowQuery.isLoading
      : singleQuery.isLoading
    : searchType === "multi"
      ? trendingMovies.isLoading || trendingShows.isLoading
      : searchType === "movie"
        ? trendingMovies.isLoading
        : trendingShows.isLoading;

  const isFetchingNextPage = isSearching
    ? searchType === "multi"
      ? multiMovieQuery.isFetchingNextPage || multiShowQuery.isFetchingNextPage
      : singleQuery.isFetchingNextPage
    : searchType === "multi"
      ? trendingMovies.isFetchingNextPage || trendingShows.isFetchingNextPage
      : searchType === "movie"
        ? trendingMovies.isFetchingNextPage
        : trendingShows.isFetchingNextPage;

  const hasNextPage = isSearching
    ? searchType === "multi"
      ? multiMovieQuery.hasNextPage || multiShowQuery.hasNextPage
      : singleQuery.hasNextPage
    : searchType === "multi"
      ? trendingMovies.hasNextPage || trendingShows.hasNextPage
      : searchType === "movie"
        ? trendingMovies.hasNextPage
        : trendingShows.hasNextPage;

  const { results, totalResults } = useMemo(() => {
    // Merge movie+show pages page-by-page so already-rendered items keep their
    // position when a new page arrives. A global sort would re-thread new items
    // into the existing list and shift the scroll under the user's cursor.
    const mergeMultiPages = <
      T extends { popularity?: number | null },
    >(
      moviePages: { results: T[]; totalResults: number }[],
      showPages: { results: T[]; totalResults: number }[],
    ) => {
      const merged: T[] = [];
      const maxPages = Math.max(moviePages.length, showPages.length);
      for (let i = 0; i < maxPages; i++) {
        const pageItems = [
          ...(moviePages[i]?.results ?? []),
          ...(showPages[i]?.results ?? []),
        ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        merged.push(...pageItems);
      }
      const movieTotal = moviePages[0]?.totalResults ?? 0;
      const showTotal = showPages[0]?.totalResults ?? 0;
      return { results: merged, totalResults: movieTotal + showTotal };
    };

    if (isSearching) {
      if (searchType === "multi") {
        return mergeMultiPages(
          multiMovieQuery.data?.pages ?? [],
          multiShowQuery.data?.pages ?? [],
        );
      }
      const pages = singleQuery.data?.pages ?? [];
      const flat = pages.flatMap((p) => p.results);
      return { results: flat, totalResults: pages[0]?.totalResults ?? 0 };
    }

    // Trending mode
    if (searchType === "multi") {
      return mergeMultiPages(
        trendingMovies.data?.pages ?? [],
        trendingShows.data?.pages ?? [],
      );
    }
    const sourceData = searchType === "movie" ? trendingMovies.data : trendingShows.data;
    const pages = sourceData?.pages ?? [];
    const flat = pages.flatMap((p) => p.results);
    return { results: flat, totalResults: pages[0]?.totalResults ?? 0 };
  }, [isSearching, searchType, singleQuery.data, multiMovieQuery.data, multiShowQuery.data, trendingMovies.data, trendingShows.data]);

  // TMDB's popularity-based pagination is unstable: the same item can appear
  // on consecutive pages. Without dedup, React sees duplicate keys and the
  // grid renders the same poster twice.
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  for (const r of results) {
    const key = `${r.provider}-${r.type}-${r.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      externalId: r.externalId,
      provider: r.provider,
      type: r.type as "movie" | "show",
      title: r.title,
      posterPath: r.posterPath ?? null,
      year: r.year,
      voteAverage: r.voteAverage,
      popularity: r.popularity,
    });
  }

  const refetchAll = useCallback(() => {
    if (isSearching) {
      if (searchType === "multi") {
        void multiMovieQuery.refetch();
        void multiShowQuery.refetch();
      } else {
        void singleQuery.refetch();
      }
    } else {
      void trendingMovies.refetch();
      void trendingShows.refetch();
    }
  }, [isSearching, searchType, singleQuery, multiMovieQuery, multiShowQuery, trendingMovies, trendingShows]);

  const fetchNextPage = useCallback(() => {
    if (isSearching) {
      if (searchType === "multi") {
        if (multiMovieQuery.hasNextPage && !multiMovieQuery.isFetchingNextPage)
          void multiMovieQuery.fetchNextPage();
        if (multiShowQuery.hasNextPage && !multiShowQuery.isFetchingNextPage)
          void multiShowQuery.fetchNextPage();
      } else {
        if (singleQuery.hasNextPage && !singleQuery.isFetchingNextPage)
          void singleQuery.fetchNextPage();
      }
    } else {
      if (searchType !== "show" && trendingMovies.hasNextPage && !trendingMovies.isFetchingNextPage)
        void trendingMovies.fetchNextPage();
      if (searchType !== "movie" && trendingShows.hasNextPage && !trendingShows.isFetchingNextPage)
        void trendingShows.fetchNextPage();
    }
  }, [isSearching, searchType, singleQuery, multiMovieQuery, multiShowQuery, trendingMovies, trendingShows]);

  return {
    items,
    totalResults,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetchAll,
  };
}
