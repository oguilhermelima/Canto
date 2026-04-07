"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { MediaGrid } from "~/components/media/media-grid";
import type { FilterOutput } from "~/components/media/filter-sidebar";

export function MediaListTab({
  slug,
  preset,
  showFilters,
  filters,
}: {
  slug: string;
  preset: "emptyWatchlist" | "emptyServerLibrary";
  showFilters: boolean;
  filters: FilterOutput;
}): React.JSX.Element {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = trpc.list.getBySlug.useQuery({
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

  const items = useMemo(() =>
    data?.items.map((item) => ({
      id: item.media.id,
      type: item.media.type as "movie" | "show",
      title: item.media.title,
      posterPath: item.media.posterPath,
      year: item.media.year ?? undefined,
      voteAverage: item.media.voteAverage ?? undefined,
    })) ?? [],
  [data]);

  if (isError) {
    return <StateMessage preset="error" onRetry={() => void refetch()} />;
  }

  if (!isLoading && items.length === 0) {
    return (
      <StateMessage
        preset={preset}
        action={{ label: "Discover Media", onClick: () => router.push("/") }}
      />
    );
  }

  return <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />;
}
