"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Bookmark,
  Film,
  List,
  Server,
  Settings2,
  Tv,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { MediaGrid } from "~/components/media/media-grid";
import {
  MediaFilterSidebar,
  type FilterState,
} from "~/components/media/media-filter-sidebar";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

const DEFAULT_FILTERS: FilterState = {
  sortBy: "popularity",
  sortOrder: "desc",
  genres: new Set(),
  yearMin: "",
  yearMax: "",
  status: "",
  runtimeMax: "",
  contentRating: "",
  scoreMin: [0],
  language: "",
  provider: "",
};

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const { data, isLoading, error } = trpc.list.getBySlug.useQuery({
    slug,
    limit: 100,
  });

  useEffect(() => {
    if (data?.list.name) {
      document.title = `${data.list.name} — Canto`;
    }
  }, [data?.list.name]);

  const handleFilterChange = useCallback((f: FilterState) => setFilters(f), []);
  const handleFilterReset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const items = useMemo(() => {
    const all =
      data?.items.map((item) => ({
        id: item.media.id,
        type: item.media.type as "movie" | "show",
        title: item.media.title,
        posterPath: item.media.posterPath,
        year: item.media.year ?? undefined,
        voteAverage: item.media.voteAverage ?? undefined,
      })) ?? [];

    // Type filter
    const typed = typeFilter === "all" ? all : all.filter((i) => i.type === typeFilter);

    // Sidebar filters
    const filtered = typed.filter((r) => {
      if (r.year) {
        const yearMin = filters.yearMin ? Number(filters.yearMin) : 0;
        const yearMax = filters.yearMax ? Number(filters.yearMax) : 9999;
        if (r.year < yearMin || r.year > yearMax) return false;
      }
      const minScore = filters.scoreMin[0] ?? 0;
      if (minScore > 0 && r.voteAverage != null && r.voteAverage < minScore)
        return false;
      return true;
    });

    // Sort
    const { sortBy, sortOrder } = filters;
    if (sortBy && sortBy !== "popularity") {
      filtered.sort((a, b) => {
        let cmp = 0;
        if (sortBy === "name") cmp = a.title.localeCompare(b.title);
        else if (sortBy === "year") cmp = (a.year ?? 0) - (b.year ?? 0);
        else if (sortBy === "rating") cmp = (a.voteAverage ?? 0) - (b.voteAverage ?? 0);
        return sortOrder === "desc" ? -cmp : cmp;
      });
    }

    return filtered;
  }, [data, typeFilter, filters]);

  const emptyIcon =
    data?.list.type === "watchlist"
      ? Bookmark
      : data?.list.type === "server"
        ? Server
        : List;
  const EmptyIcon = emptyIcon;

  if (error) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <div className="text-center">
          <List className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
          <p className="text-lg font-medium text-muted-foreground">
            List not found
          </p>
          <Link
            href="/lists"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-12">
      <PageHeader
        title={data?.list.name ?? "List"}
        subtitle={data?.list.description ?? undefined}
        className={cn(
          "transition-[margin] duration-300 ease-in-out",
          showFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      />

      {/* Tab Bar */}
      <div
        className={cn(
          "px-4 pt-6 pb-8 transition-[margin] duration-300 ease-in-out md:px-8 lg:px-12 xl:px-16 2xl:px-24",
          showFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      >
        <TabBar
          tabs={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as "all" | "movie" | "show")}
          leading={
            <button
              type="button"
              className={cn(
                "flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-all",
                showFilters
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setShowFilters((v) => !v)}
            >
              <Settings2
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  showFilters && "rotate-90",
                )}
              />
            </button>
          }
        />
      </div>

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Filter Sidebar */}
        <div
          className={cn(
            "fixed top-16 z-[35] hidden transition-[left,opacity] duration-300 ease-in-out md:block",
            showFilters
              ? "left-4 opacity-100 md:left-8 lg:left-12 xl:left-16 2xl:left-24"
              : "-left-72 opacity-0",
          )}
          style={{ width: "16rem", height: "calc(100vh - 5rem)", top: "5rem" }}
        >
          <MediaFilterSidebar
            mediaType={typeFilter === "all" ? "all" : typeFilter}
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
          />
        </div>

        {/* Content */}
        <div
          className={cn(
            "transition-[margin] duration-300 ease-in-out",
            showFilters && "md:ml-[17rem] lg:ml-[19rem]",
          )}
        >
          {!isLoading && items.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="text-center">
                <EmptyIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
                <p className="text-lg font-medium text-muted-foreground">
                  This list is empty
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Browse media and add items to get started.
                </p>
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Discover Media
                </Link>
              </div>
            </div>
          ) : (
            <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />
          )}
        </div>
      </div>
    </div>
  );
}
