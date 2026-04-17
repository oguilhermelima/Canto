"use client";

import { BrowseLayout } from "~/components/layout/browse-layout";
import { progressStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useLibraryBrowse } from "~/hooks/use-library-browse";
import { useViewMode } from "~/hooks/use-view-mode";

export default function ContinueWatchingPage(): React.JSX.Element {
  useDocumentTitle("Continue Watching");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.continueWatching", "list");
  const browse = useLibraryBrowse({ view: "continue" });

  return (
    <BrowseLayout
      title="Continue Watching"
      subtitle="Pick up where you left off."
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
      emptyState={<StateMessage preset="emptyContinueWatching" />}
      errorState={browse.isError ? <StateMessage preset="error" onRetry={browse.refetch} /> : undefined}
    />
  );
}
