"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, FolderOpen, Server } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import {
  FilterSidebar,
  type FilterOutput,
} from "~/components/media/filter-sidebar";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { FilterButton } from "~/components/layout/filter-button";
import { MediaListTab } from "./_components/media-list-tab";
import {
  CollectionFilterSidebar,
  DEFAULT_COLLECTION_FILTERS,
  type CollectionFilterState,
} from "./_components/collection-filter-sidebar";
import { CollectionsTab } from "./_components/collections-tab";

const TABS = [
  { value: "watchlist", label: "Watchlist", icon: Eye },
  { value: "collections", label: "Collections", icon: FolderOpen },
  { value: "server", label: "Server Library", icon: Server },
];

type Tab = "watchlist" | "collections" | "server";

export default function LibraryPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "watchlist";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOutput>({});
  const [collectionFilters, setCollectionFilters] = useState<CollectionFilterState>(DEFAULT_COLLECTION_FILTERS);

  useDocumentTitle("Library");

  const handleTabChange = (value: string): void => {
    const tab = value as Tab;
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== "watchlist") params.set("tab", tab);
    router.replace(`/library${params.size > 0 ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  const handleFilterChange = useCallback((f: FilterOutput) => setFilters(f), []);
  const handleCollectionFilterChange = useCallback((f: CollectionFilterState) => setCollectionFilters(f), []);
  const handleCollectionFilterReset = useCallback(() => setCollectionFilters(DEFAULT_COLLECTION_FILTERS), []);

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Library"
        subtitle="Your watchlist, collections, and saved media."
      />

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Sidebar */}
        <div
          className={cn(
            "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
            showFilters
              ? "mr-4 opacity-100 lg:mr-8"
              : "-ml-[20rem] mr-0 opacity-0",
          )}
        >
          {activeTab === "collections" ? (
            <CollectionFilterSidebar
              filters={collectionFilters}
              onChange={handleCollectionFilterChange}
              onReset={handleCollectionFilterReset}
            />
          ) : (
            <FilterSidebar
              mediaType="all"
              onFilterChange={handleFilterChange}
            />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <TabBar
            tabs={TABS}
            value={activeTab}
            onChange={handleTabChange}
            leading={
              <FilterButton
                active={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              />
            }
          />
          {activeTab === "watchlist" && (
            <MediaListTab
              slug="watchlist"
              preset="emptyWatchlist"
              showFilters={showFilters}
              filters={filters}
            />
          )}
          {activeTab === "collections" && <CollectionsTab filters={collectionFilters} />}
          {activeTab === "server" && (
            <MediaListTab
              slug="server-library"
              preset="emptyServerLibrary"
              showFilters={showFilters}
              filters={filters}
            />
          )}
        </div>
      </div>
    </div>
  );
}
