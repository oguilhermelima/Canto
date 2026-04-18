"use client";

import { BrowseLayout } from "~/components/layout/browse-layout";
import { browseStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useLibraryBrowse } from "~/hooks/use-library-browse";
import { useViewMode } from "~/hooks/use-view-mode";

export default function RatingsPage(): React.JSX.Element {
  useDocumentTitle("Your Ratings");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.ratings", "grid");
  const browse = useLibraryBrowse({ view: "ratings" });

  return (
    <BrowseLayout
      title="Your Ratings"
      subtitle="Every title you've scored."
      items={browse.items}
      strategy={browseStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={browse.isLoading}
      isFetchingNextPage={browse.isFetchingNextPage}
      hasNextPage={browse.hasNextPage}
      onFetchNextPage={browse.onFetchNextPage}
      mediaType={browse.mediaType}
      onMediaTypeChange={browse.setMediaType}
      emptyState={<StateMessage preset="emptyRatings" />}
      errorState={browse.isError ? <StateMessage preset="error" onRetry={browse.refetch} /> : undefined}
    />
  );
}
