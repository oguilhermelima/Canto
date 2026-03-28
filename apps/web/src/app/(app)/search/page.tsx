"use client";

import { useState, useCallback } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import { Button } from "@canto/ui/button";
import { Search } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaGrid } from "~/components/media/media-grid";

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
  const [page, setPage] = useState(1);

  const apiType: "movie" | "show" =
    searchType === "multi" ? "movie" : searchType;

  const movieResults = trpc.media.search.useQuery(
    { query, type: apiType, provider: "tmdb", page },
    {
      enabled: query.length >= 2 && searchType !== "multi",
      placeholderData: keepPreviousData,
    },
  );

  const multiMovieResults = trpc.media.search.useQuery(
    { query, type: "movie", provider: "tmdb", page },
    {
      enabled: query.length >= 2 && searchType === "multi",
      placeholderData: keepPreviousData,
    },
  );

  const multiShowResults = trpc.media.search.useQuery(
    { query, type: "show", provider: "tmdb", page },
    {
      enabled: query.length >= 2 && searchType === "multi",
      placeholderData: keepPreviousData,
    },
  );

  const data =
    searchType === "multi"
      ? multiMovieResults.data && multiShowResults.data
        ? {
            results: [
              ...multiMovieResults.data.results,
              ...multiShowResults.data.results,
            ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)),
            totalPages: Math.max(
              multiMovieResults.data.totalPages,
              multiShowResults.data.totalPages,
            ),
            totalResults:
              multiMovieResults.data.totalResults +
              multiShowResults.data.totalResults,
          }
        : undefined
      : movieResults.data;

  const isLoading =
    searchType === "multi"
      ? multiMovieResults.isLoading || multiShowResults.isLoading
      : movieResults.isLoading;

  const handleSearch = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      setPage(1);
      const params = new URLSearchParams();
      if (newQuery) params.set("q", newQuery);
      if (searchType !== "multi") params.set("type", searchType);
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [searchType, router],
  );

  const handleTypeChange = useCallback(
    (type: "multi" | "movie" | "show") => {
      setSearchType(type);
      setPage(1);
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (type !== "multi") params.set("type", type);
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [query, router],
  );

  const results = (data?.results ?? []).map((r) => ({
    externalId: String(r.externalId),
    provider: r.provider,
    type: r.type as "movie" | "show",
    title: r.title,
    posterPath: r.posterPath ?? null,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Search header */}
      <div className="mb-8">
        <h1 className="mb-6 text-3xl font-bold text-black">Search</h1>

        {/* Search input */}
        <div className="relative mb-6 max-w-2xl">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search movies and TV shows..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-12 border-neutral-200 bg-white pl-11 text-base text-black placeholder:text-neutral-400"
          />
        </div>

        {/* Type tabs */}
        <div className="flex gap-1">
          {TYPE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() =>
                handleTypeChange(value as "multi" | "movie" | "show")
              }
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                searchType === value
                  ? "bg-neutral-100 text-black"
                  : "text-neutral-500 hover:text-black",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {query.length < 2 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Search className="mx-auto mb-4 h-12 w-12 text-neutral-200" />
            <p className="text-lg font-medium text-neutral-500">
              Search for movies and TV shows
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              Type at least 2 characters to start searching
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Results count */}
          {data && !isLoading && (
            <p className="mb-4 text-sm text-neutral-500">
              {data.totalResults} results for &ldquo;{query}&rdquo;
            </p>
          )}

          <MediaGrid
            items={results}
            isLoading={isLoading}
            skeletonCount={18}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-200"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-neutral-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-200"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
