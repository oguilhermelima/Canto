"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounceCallback } from "usehooks-ts";
import { type FilterOutput } from "~/components/layout/browse-layout";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { MobileSearchInput, DesktopSearchInput } from "./_components/search-input";
import { SearchResults } from "./_components/search-results";
import { useSearchQueries } from "./_components/use-search-queries";

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

  useDocumentTitle(query ? `"${query}"` : "Search");

  const isSearching = query.length >= 2;

  const {
    items,
    totalResults,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetchAll,
  } = useSearchQueries({ query, searchType, filters });

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
      <MobileSearchInput value={inputValue} onChange={handleInputChange} />

      <SearchResults
        header={<DesktopSearchInput value={inputValue} onChange={handleInputChange} />}
        searchType={searchType}
        onTypeChange={handleTypeChange}
        onFilterChange={setFilters}
        items={items}
        totalResults={totalResults}
        isLoading={isLoading}
        isError={isError}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        isSearching={isSearching}
        onFetchNextPage={fetchNextPage}
        onRefetchAll={refetchAll}
      />
    </>
  );
}
