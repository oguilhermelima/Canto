"use client";

import { useState, useCallback } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Search, Library } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaGrid } from "~/components/media/media-grid";

const SORT_OPTIONS = [
  { value: "addedAt", label: "Date Added" },
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "voteAverage", label: "Rating" },
] as const;

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "show", label: "TV Shows" },
  { value: "movie", label: "Movies" },
] as const;

export default function LibraryPage(): React.JSX.Element {
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "title" | "year" | "addedAt" | "voteAverage" | "popularity" | "releaseDate"
  >("addedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const { data, isLoading } = trpc.library.list.useQuery({
    type: typeFilter === "all" ? undefined : typeFilter,
    search: searchQuery.length >= 2 ? searchQuery : undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });

  const items = (data?.items ?? []).map((item) => ({
    id: item.id,
    type: item.type as "movie" | "show",
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    voteAverage: item.voteAverage,
  }));

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const handleTypeChange = useCallback((type: "all" | "movie" | "show") => {
    setTypeFilter(type);
    setPage(1);
  }, []);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <h1 className="mb-6 text-3xl font-bold text-black">Library</h1>

      {/* Toolbar: type tabs + search + count */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: type tabs */}
        <div className="flex items-center gap-1">
          {TYPE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleTypeChange(value as "all" | "movie" | "show")}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                typeFilter === value
                  ? "bg-neutral-100 text-black"
                  : "text-neutral-500 hover:text-black",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Right: search + sort + count */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Filter library..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-9 w-[200px] border-neutral-200 bg-white pl-9 text-sm"
            />
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-9 w-[140px] border-neutral-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-9 border-neutral-200 text-sm"
            onClick={() =>
              setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
            }
          >
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </Button>

          <span className="hidden text-sm text-neutral-400 sm:inline">
            {data
              ? `${data.total} item${data.total !== 1 ? "s" : ""}`
              : ""}
          </span>
        </div>
      </div>

      {/* Content */}
      {!isLoading && items.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Library className="mx-auto mb-4 h-16 w-16 text-neutral-200" />
            <h2 className="mb-2 text-lg font-medium text-black">
              Your library is empty
            </h2>
            <p className="max-w-sm text-sm text-neutral-500">
              Start by discovering movies and TV shows, then add them to
              your library.
            </p>
            <Button className="mt-4 bg-black text-white hover:bg-neutral-800" asChild>
              <a href="/">Discover Media</a>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <MediaGrid
            items={items}
            isLoading={isLoading}
            skeletonCount={pageSize}
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
