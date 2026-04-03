"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounceCallback } from "usehooks-ts";
import { Input } from "@canto/ui/input";
import { Film, Search, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout, type FilterOutput } from "~/components/layout/browse-layout";
import { TabBar } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";

const TYPE_OPTIONS = [
  { value: "multi" as const, label: "All" },
  { value: "movie" as const, label: "Movies", icon: Film },
  { value: "show" as const, label: "TV Shows", icon: Tv },
];

export default function SearchPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get("q") ?? "";
  const initialType = (searchParams.get("type") ?? "multi") as
    | "multi"
    | "movie"
    | "show";

  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [searchType, setSearchType] = useState<"multi" | "movie" | "show">(
    initialType,
  );
  const [filters, setFilters] = useState<FilterOutput>({});

  const searchTypeRef = useRef(searchType);
  searchTypeRef.current = searchType;

  const debouncedUpdateSearch = useDebounceCallback((value: string) => {
    setQuery(value);
    // Preserve existing params (filter sidebar manages its own)
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value); else params.delete("q");
    if (searchTypeRef.current !== "multi") params.set("type", searchTypeRef.current); else params.delete("type");
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, 300);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      debouncedUpdateSearch(value);
    },
    [debouncedUpdateSearch],
  );

  // Sync query state with URL search params (topbar updates the URL)
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== query) {
      setQuery(q);
      setInputValue(q);
    }
  }, [searchParams]);

  // Set page title
  useEffect(() => {
    document.title = query ? `"${query}" — Canto` : "Search — Canto";
  }, [query]);

  const isSearching = query.length >= 2;

  const pageParam = {
    getNextPageParam: (
      lastPage: { totalPages: number },
      _allPages: unknown[],
      lastPageParam: unknown,
    ) => {
      const currentPage = (lastPageParam as number) ?? 1;
      if (currentPage >= lastPage.totalPages) return undefined;
      return currentPage + 1;
    },
    initialCursor: 1,
  };

  /* ─── Search queries (when typing) ─── */

  const singleQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: searchType === "multi" ? "movie" : searchType, provider: "tmdb" },
    { enabled: isSearching && searchType !== "multi", ...pageParam },
  );

  const multiMovieQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: "movie", provider: "tmdb" },
    { enabled: isSearching && searchType === "multi", ...pageParam },
  );

  const multiShowQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: "show", provider: "tmdb" },
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
      ? (multiMovieQuery.hasNextPage ?? false) || (multiShowQuery.hasNextPage ?? false)
      : (singleQuery.hasNextPage ?? false)
    : searchType === "multi"
      ? (trendingMovies.hasNextPage ?? false) || (trendingShows.hasNextPage ?? false)
      : searchType === "movie"
        ? (trendingMovies.hasNextPage ?? false)
        : (trendingShows.hasNextPage ?? false);

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
    const source = searchType === "movie" ? trendingMovies : trendingShows;
    const pages = source.data?.pages ?? [];
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

  const handleTypeChange = useCallback(
    (type: "multi" | "movie" | "show") => {
      setSearchType(type);
      const params = new URLSearchParams(searchParams.toString());
      if (inputValue) params.set("q", inputValue); else params.delete("q");
      if (type !== "multi") params.set("type", type); else params.delete("type");
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [inputValue, router, searchParams],
  );

  return (
    <>
      {/* Mobile search input — sticky */}
      <div className="sticky top-0 z-30 bg-background px-4 pb-1 pt-2.5 md:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search movies and shows..."
            className="h-9 rounded-none border-x-0 border-t-0 border-b-border bg-transparent pl-9 text-sm focus-visible:border-b-ring focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
        </div>
      </div>

    <BrowseLayout
      title="Search"
      hideTitle
      mediaType={searchType === "multi" ? "all" : searchType}
      onFilterChange={setFilters}
      header={
        <div className="hidden pb-1 pt-4 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Search movies and shows..."
              className="h-12 rounded-none border-x-0 border-t-0 border-b-border bg-transparent pl-10 text-lg focus-visible:border-b-ring focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
          </div>
        </div>
      }
      items={items}
      totalResults={totalResults}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onFetchNextPage={fetchNextPage}
      toolbar={
        <TabBar
          tabs={TYPE_OPTIONS.map(({ value, label, icon }) => ({ value, label, icon }))}
          value={searchType}
          onChange={(v) => handleTypeChange(v as "multi" | "movie" | "show")}
          className="mb-0 py-0"
        />
      }
      emptyState={
        isError ? (
          <StateMessage preset="errorSearch" onRetry={refetchAll} minHeight="400px" />
        ) : !isLoading && totalResults === 0 && isSearching ? (
          <StateMessage preset="emptySearch" minHeight="400px" />
        ) : undefined
      }
    />
    </>
  );
}
