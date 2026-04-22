"use client";

import { BrowseLayout } from "@/components/layout/browse-layout";
import { browseStrategy } from "@/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLibraryBrowse } from "@/hooks/use-library-browse";
import { useViewMode } from "@/hooks/use-view-mode";

export default function FavoritesPage(): React.JSX.Element {
  useDocumentTitle("Favorites");

  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.favorites", "grid");
  const browse = useLibraryBrowse({ view: "favorites" });

  return (
    <BrowseLayout
      title="Favorites"
      subtitle="Stars in your personal constellation."
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
      emptyState={<StateMessage preset="emptyFavorites" />}
      errorState={browse.isError ? <StateMessage preset="error" onRetry={browse.refetch} /> : undefined}
    />
  );
}
