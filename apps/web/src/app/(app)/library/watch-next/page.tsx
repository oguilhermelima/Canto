"use client";

import { BrowseLayout } from "@/components/layout/browse-layout";
import { progressStrategy } from "@/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLibraryBrowse } from "@/hooks/use-library-browse";
import { useViewMode } from "@/hooks/use-view-mode";

export default function WatchNextPage(): React.JSX.Element {
  useDocumentTitle("Watch Next");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.watchNext", "list");
  const browse = useLibraryBrowse({ view: "watch_next" });

  return (
    <BrowseLayout
      title="Watch Next"
      subtitle="Your next episodes are ready."
      items={browse.items}
      strategy={progressStrategy}
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
      emptyState={<StateMessage preset="emptyWatchNext" />}
      errorState={browse.isError ? <StateMessage preset="error" onRetry={browse.refetch} /> : undefined}
    />
  );
}
