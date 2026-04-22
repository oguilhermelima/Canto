"use client";

import { BrowseLayout } from "@/components/layout/browse-layout";
import { historyStrategy } from "@/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLibraryBrowse } from "@/hooks/use-library-browse";
import { useViewMode } from "@/hooks/use-view-mode";

export default function WatchedPage(): React.JSX.Element {
  useDocumentTitle("Watched");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.watched", "list");
  const browse = useLibraryBrowse({ view: "watched" });

  return (
    <BrowseLayout
      title="Watched"
      subtitle="Everything you've finished watching."
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
      emptyState={
        <StateMessage
          title="Uncharted territory"
          description="Your watched titles will appear here as you explore the cosmos of entertainment."
        />
      }
      errorState={browse.isError ? <StateMessage preset="error" onRetry={browse.refetch} /> : undefined}
    />
  );
}
