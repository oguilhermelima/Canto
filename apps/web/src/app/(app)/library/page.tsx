"use client";

import { useState, useCallback } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Skeleton } from "@canto/ui/skeleton";
import { Film, Tv, Library, HardDrive } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaGrid } from "~/components/media/media-grid";
import {
  FilterSidebar,
  DEFAULT_FILTERS,
  type LibraryFilters,
} from "~/components/library/filter-sidebar";

const SORT_OPTIONS = [
  { value: "addedAt", label: "Date Added" },
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "voteAverage", label: "Rating" },
] as const;

export default function LibraryPage(): React.JSX.Element {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<
    "title" | "year" | "addedAt" | "voteAverage" | "popularity" | "releaseDate"
  >("addedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const { data: stats, isLoading: statsLoading } =
    trpc.library.stats.useQuery();

  const { data, isLoading } = trpc.library.list.useQuery({
    type: filters.type === "all" ? undefined : filters.type,
    genre: filters.genres.length > 0 ? filters.genres.join(",") : undefined,
    search: undefined,
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

  const handleFiltersChange = useCallback((newFilters: LibraryFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Library</h1>
        <p className="text-muted-foreground">
          Your personal media collection
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={Library}
          label="Total"
          value={stats?.total}
          isLoading={statsLoading}
        />
        <StatCard
          icon={Film}
          label="Movies"
          value={stats?.movies}
          isLoading={statsLoading}
        />
        <StatCard
          icon={Tv}
          label="TV Shows"
          value={stats?.shows}
          isLoading={statsLoading}
        />
        <StatCard
          icon={HardDrive}
          label="Storage"
          value={stats?.storageBytes ? formatStorage(Number(stats.storageBytes)) : "0 GB"}
          isLoading={statsLoading}
        />
      </div>

      {/* Filters + Sort row */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start">
        <FilterSidebar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          isOpen={filtersOpen}
          onToggle={() => setFiltersOpen(!filtersOpen)}
          className="shrink-0"
        />

        <div className="flex-1">
          {/* Sort controls */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data
                ? `${data.total} item${data.total !== 1 ? "s" : ""}`
                : "Loading..."}
            </p>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[150px]">
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
                onClick={() =>
                  setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
                }
              >
                {sortOrder === "asc" ? "Asc" : "Desc"}
              </Button>
            </div>
          </div>

          {/* Content */}
          {!isLoading && items.length === 0 ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <Library className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
                <h2 className="mb-2 text-lg font-medium text-foreground">
                  Your library is empty
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Start by discovering movies and TV shows, then add them to
                  your library.
                </p>
                <Button className="mt-4" asChild>
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
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
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
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p className="text-xl font-bold text-foreground">
              {value ?? 0}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatStorage(bytes: number): string {
  if (bytes === 0) return "0 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}
