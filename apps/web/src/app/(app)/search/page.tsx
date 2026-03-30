"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import { Search } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout } from "~/components/layout/browse-layout";
import { TabBar } from "~/components/layout/tab-bar";

const TYPE_OPTIONS = [
  { value: "multi", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV Shows" },
] as const;

export default function SearchPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get("q") ?? "";
  const initialType = (searchParams.get("type") ?? "multi") as
    | "multi"
    | "movie"
    | "show";

  const [query, setQuery] = useState(initialQuery);
  const [searchType, setSearchType] = useState<"multi" | "movie" | "show">(
    initialType,
  );

  // Sync query state with URL search params (topbar updates the URL)
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== query) setQuery(q);
  }, [searchParams]);

  // Set page title
  useEffect(() => {
    document.title = query ? `"${query}" — Canto` : "Search — Canto";
  }, [query]);

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

  const singleQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: searchType === "multi" ? "movie" : searchType, provider: "tmdb" },
    { enabled: query.length >= 2 && searchType !== "multi", ...pageParam },
  );

  const multiMovieQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: "movie", provider: "tmdb" },
    { enabled: query.length >= 2 && searchType === "multi", ...pageParam },
  );

  const multiShowQuery = trpc.media.browse.useInfiniteQuery(
    { mode: "search", query, type: "show", provider: "tmdb" },
    { enabled: query.length >= 2 && searchType === "multi", ...pageParam },
  );

  const isLoading =
    searchType === "multi"
      ? multiMovieQuery.isLoading || multiShowQuery.isLoading
      : singleQuery.isLoading;

  const isFetchingNextPage =
    searchType === "multi"
      ? multiMovieQuery.isFetchingNextPage || multiShowQuery.isFetchingNextPage
      : singleQuery.isFetchingNextPage;

  const hasNextPage =
    searchType === "multi"
      ? (multiMovieQuery.hasNextPage ?? false) ||
        (multiShowQuery.hasNextPage ?? false)
      : (singleQuery.hasNextPage ?? false);

  const { results, totalResults } = useMemo(() => {
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
  }, [searchType, singleQuery.data, multiMovieQuery.data, multiShowQuery.data]);

  const items = results.map((r) => ({
    externalId: r.externalId,
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
    popularity: r.popularity,
    genreIds: r.genreIds as number[] | undefined,
  }));

  const fetchNextPage = useCallback(() => {
    if (searchType === "multi") {
      if (multiMovieQuery.hasNextPage && !multiMovieQuery.isFetchingNextPage)
        void multiMovieQuery.fetchNextPage();
      if (multiShowQuery.hasNextPage && !multiShowQuery.isFetchingNextPage)
        void multiShowQuery.fetchNextPage();
    } else {
      if (singleQuery.hasNextPage && !singleQuery.isFetchingNextPage)
        void singleQuery.fetchNextPage();
    }
  }, [searchType, singleQuery, multiMovieQuery, multiShowQuery]);

  const handleTypeChange = useCallback(
    (type: "multi" | "movie" | "show") => {
      setSearchType(type);
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (type !== "multi") params.set("type", type);
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [query, router],
  );

  const mediaType =
    searchType === "multi"
      ? "all"
      : searchType === "movie"
        ? "movie"
        : "show";

  return (
    <>
      {/* Mobile search input */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background px-4 py-2.5 md:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              const params = new URLSearchParams();
              if (e.target.value) params.set("q", e.target.value);
              if (searchType !== "multi") params.set("type", searchType);
              router.replace(`/search?${params.toString()}`, { scroll: false });
            }}
            placeholder="Search movies and shows..."
            className="h-9 pl-9 text-sm"
            autoFocus
          />
        </div>
      </div>

    <BrowseLayout
      title="Search"
      hideTitle
      mediaType={mediaType as "all" | "movie" | "show"}
      items={items}
      totalResults={totalResults}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onFetchNextPage={fetchNextPage}
      toolbar={
        <TabBar
          tabs={TYPE_OPTIONS.map(({ value, label }) => ({ value, label }))}
          value={searchType}
          onChange={(v) => handleTypeChange(v as "multi" | "movie" | "show")}
        />
      }
      emptyState={
        query.length < 2 ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Search className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
              <p className="text-lg font-medium text-muted-foreground">
                Search for movies and TV shows
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Type at least 2 characters to start searching
              </p>
            </div>
          </div>
        ) : undefined
      }
    />
    </>
  );
}
