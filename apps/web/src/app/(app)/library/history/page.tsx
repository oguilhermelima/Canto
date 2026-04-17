"use client";

import { BrowseLayout } from "~/components/layout/browse-layout";
import { historyStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useLibraryBrowse } from "~/hooks/use-library-browse";
import { useViewMode } from "~/hooks/use-view-mode";

export default function HistoryPage(): React.JSX.Element {
  useDocumentTitle("Watch History");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.history", "list");
  const browse = useLibraryBrowse({ view: "history" });

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
