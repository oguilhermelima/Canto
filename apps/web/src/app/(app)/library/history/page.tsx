"use client";

import { BrowseLayout } from "@/components/layout/browse-layout";
import type { BrowseItem } from "@/components/layout/browse-layout.types";
import { historyStrategy } from "@/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLibraryBrowse } from "@/hooks/use-library-browse";
import { useViewMode } from "@/hooks/use-view-mode";

const DAY_MS = 86_400_000;

function formatDayLabel(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today.getTime() - target.getTime();

  if (diff < DAY_MS) return "Today";
  if (diff < DAY_MS * 2) return "Yesterday";
  if (diff < DAY_MS * 7) {
    return target.toLocaleDateString(undefined, { weekday: "long" });
  }
  if (target.getFullYear() === today.getFullYear()) {
    return target.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }
  return target.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function HistoryPage(): React.JSX.Element {
  useDocumentTitle("Watch History");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.history", "list");
  const browse = useLibraryBrowse({ view: "history" });

  const sortBy = browse.filters.sortBy;
  const groupByWatchedAt = sortBy === undefined || sortBy === "recently_watched";

  return (
    <BrowseLayout
      title="Watch History"
      subtitle="A timeline of everything you've watched."
      items={browse.items}
      strategy={historyStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={browse.isLoading}
      isFetchingNextPage={browse.isFetchingNextPage}
      hasNextPage={browse.hasNextPage}
      onFetchNextPage={browse.onFetchNextPage}
      filterPreset="library"
      onFilterChange={browse.setFilters}
      mediaType={browse.mediaType}
      onMediaTypeChange={browse.setMediaType}
      groupBy={groupByWatchedAt ? (item: BrowseItem) => formatDayLabel(item.watchedAt) : undefined}
      emptyState={
        <StateMessage
          title="Stellar silence"
          description="Your watch history will build up here as you journey through movies and shows."
        />
      }
      errorState={browse.isError ? <StateMessage preset="error" onRetry={browse.refetch} /> : undefined}
    />
  );
}
