"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { type FilterOutput } from "~/components/media/filter-sidebar";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { PageHeader } from "~/components/layout/page-header";
import { ListFilterSidebar } from "./_components/list-filter-sidebar";
import { ListContent } from "./_components/list-content";

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
      />

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ListFilterSidebar
          mediaType={typeFilter}
          visible={showFilters}
          onFilterChange={handleFilterChange}
        />

        <ListContent
          items={items}
          isLoading={isLoading}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
        />
      </div>
    </div>
  );
}
