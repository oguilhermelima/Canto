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
  FilterSidebar,
  type FilterOutput,
} from "~/components/media/filter-sidebar";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOutput>({});

  const { data, isLoading, error } = trpc.list.getBySlug.useQuery({
    slug,
    limit: 100,
    genreIds: filters.genreIds,
    genreMode: filters.genreMode,
    language: filters.language,
    scoreMin: filters.scoreMin,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    runtimeMin: filters.runtimeMin,
    runtimeMax: filters.runtimeMax,
    certification: filters.certification,
    status: filters.status,
    sortBy: filters.sortBy,
    watchProviders: filters.watchProviders,
    watchRegion: filters.watchRegion,
  });

  useEffect(() => {
    if (data?.list.name) {
      document.title = `${data.list.name} — Canto`;
    }
  }, [data?.list.name]);

  const handleFilterChange = useCallback((f: FilterOutput) => setFilters(f), []);

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

    // Type filter (client-side, tabs)
    return typeFilter === "all" ? all : all.filter((i) => i.type === typeFilter);
  }, [data, typeFilter]);

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

      <div className="flex px-4 pt-4 md:px-8 md:pt-6 lg:px-12 xl:px-16 2xl:px-24">
        {/* Sidebar */}
        <div
          className={cn(
            "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
            showFilters
              ? "mr-4 opacity-100 lg:mr-8"
              : "-ml-[20rem] mr-0 opacity-0",
          )}
        >
          <FilterSidebar
            mediaType={typeFilter}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Tab Bar */}
          <div className="mb-6 py-3">
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
