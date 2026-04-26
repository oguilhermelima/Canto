"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StateMessage } from "@canto/ui/state-message";
import { BrowseLayout } from "@/components/layout/browse-layout";
import type {
  BrowseItem,
  FilterOutput,
} from "@/components/layout/browse-layout";
import { collectionStrategy } from "@/components/layout/card-strategies";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useViewMode } from "@/hooks/use-view-mode";

const PAGE_SIZE = 20;

export default function AllCollectionItemsPage(): React.JSX.Element {
  useDocumentTitle("All Collection Items");
  const router = useRouter();

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode(
    "canto.collections.allItems.viewMode",
  );

  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.list.getAllCollectionItems.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      q: filters.q,
      genreIds: filters.genreIds,
      genreMode: filters.genreMode,
      language: filters.language,
      scoreMin: filters.scoreMin,
      scoreMax: filters.scoreMax,
      yearMin: filters.yearMin,
      yearMax: filters.yearMax,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      certification: filters.certification,
      status: filters.status,
      sortBy: filters.sortBy,
      watchProviders: filters.watchProviders,
      watchRegion: filters.watchRegion,
      watchStatuses: filters.watchStatuses as
        | ("planned" | "watching" | "completed" | "dropped" | "none")[]
        | undefined,
    },
    {
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const currentOffset = lastPageParam as number;
        const nextOffset = currentOffset + PAGE_SIZE;
        if (nextOffset >= lastPage.total) return undefined;
        return nextOffset;
      },
      initialCursor: 0,
    },
  );

  const items: BrowseItem[] = useMemo(() => {
    const all =
      data?.pages.flatMap((page) =>
        page.items.map((item) => ({
          id: item.media.id,
          externalId: String(item.media.externalId),
          provider: item.media.provider,
          type: item.media.type as "movie" | "show",
          title: item.media.title,
          posterPath: item.media.posterPath,
          year: item.media.year ?? undefined,
          voteAverage: item.media.voteAverage ?? undefined,
          overview: item.media.overview ?? undefined,
          userRating: item.userRating,
          membership: item.membership,
        })),
      ) ?? [];

    return typeFilter === "all"
      ? all
      : all.filter((i) => i.type === typeFilter);
  }, [data, typeFilter]);

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <BrowseLayout
      title="All Collection Items"
      subtitle="Everything across your collections in one place."
      items={items}
      strategy={collectionStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onFetchNextPage={handleFetchNextPage}
      filterPreset="tmdb"
      onFilterChange={setFilters}
      mediaType={typeFilter}
      onMediaTypeChange={setTypeFilter}
      emptyState={
        <StateMessage
          preset="emptyCollections"
          action={{
            label: "Back to Collections",
            onClick: () => router.push("/library/collections"),
          }}
        />
      }
    />
  );
}
