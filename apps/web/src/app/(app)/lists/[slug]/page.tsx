"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Film,
  Settings2,
  Tv,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
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
  const router = useRouter();
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

  if (error) {
    return (
      <StateMessage
        preset="notFoundList"
        action={{ label: "Back to Library", onClick: () => router.push("/lists") }}
        minHeight="400px"
      />
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
            <StateMessage
              preset="emptyList"
              action={{ label: "Discover Media", onClick: () => router.push("/") }}
            />
          ) : (
            <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />
          )}
        </div>
      </div>
    </div>
  );
}
