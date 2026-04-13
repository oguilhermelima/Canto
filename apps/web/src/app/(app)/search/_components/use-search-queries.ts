import { useMemo, useCallback } from "react";
import { trpc } from "~/lib/trpc/client";
import type { FilterOutput } from "~/components/layout/browse-layout";

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

  /* ─── Search queries (when typing) ─── */

  const searchFilters = {
    genres: filters.genres,
    language: filters.language,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
  };

  const singleQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: searchType === "multi" ? "movie" : searchType, provider: "tmdb", ...searchFilters },
    { enabled: isSearching && searchType !== "multi", ...pageParam },
  );

  const multiMovieQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: "movie", provider: "tmdb", ...searchFilters },
    { enabled: isSearching && searchType === "multi", ...pageParam },
  );

  const multiShowQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: "show", provider: "tmdb", ...searchFilters },
    { enabled: isSearching && searchType === "multi", ...pageParam },
  );

  /* ─── Trending/Discover queries (default, no search) ─── */

  const hasFilters = Object.keys(filters).length > 0;
  const browseMode = hasFilters ? "discover" as const : "trending" as const;

  const trendingMovies = trpc.media.browse.useInfiniteQuery(
    {
      mode: browseMode, type: "movie",
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
    },
    { enabled: !isSearching && searchType !== "show", staleTime: 10 * 60 * 1000, ...pageParam },
  );

  const trendingShows = trpc.media.browse.useInfiniteQuery(
    {
      mode: browseMode, type: "show",
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
    },
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
    if (isSearching) {
      if (searchType === "multi") {
        const moviePages = multiMovieQuery.data?.pages ?? [];
        const showPages = multiShowQuery.data?.pages ?? [];
        const merged = [
          ...moviePages.flatMap((p) => p.results),
          ...showPages.flatMap((p) => p.results),
        ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        const movieTotal = moviePages[0]?.totalResults ?? 0;
        const showTotal = showPages[0]?.totalResults ?? 0;
        return { results: merged, totalResults: movieTotal + showTotal };
      }
      const pages = singleQuery.data?.pages ?? [];
      const flat = pages.flatMap((p) => p.results);
      return { results: flat, totalResults: pages[0]?.totalResults ?? 0 };
    }

    // Trending mode
    if (searchType === "multi") {
      const moviePages = trendingMovies.data?.pages ?? [];
      const showPages = trendingShows.data?.pages ?? [];
      const merged = [
        ...moviePages.flatMap((p) => p.results),
        ...showPages.flatMap((p) => p.results),
      ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      const movieTotal = moviePages[0]?.totalResults ?? 0;
      const showTotal = showPages[0]?.totalResults ?? 0;
      return { results: merged, totalResults: movieTotal + showTotal };
    }
    const sourceData = searchType === "movie" ? trendingMovies.data : trendingShows.data;
    const pages = sourceData?.pages ?? [];
    const flat = pages.flatMap((p) => p.results);
    return { results: flat, totalResults: pages[0]?.totalResults ?? 0 };
  }, [isSearching, searchType, singleQuery.data, multiMovieQuery.data, multiShowQuery.data, trendingMovies.data, trendingShows.data]);

  const items = results.map((r) => ({
    externalId: r.externalId,
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
    popularity: r.popularity,
  }));

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
