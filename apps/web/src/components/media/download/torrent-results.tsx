"use client";

import { Button } from "@canto/ui/button";
import { StateMessage } from "@canto/ui/state-message";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { FilterToolbar } from "./filter-toolbar";
import { ScanningState } from "./scanning-state";
import { TorrentCard, type TorrentResult } from "./torrent-card";

interface TorrentResultsProps {
  mediaId: string;
  mediaTitle: string;
  torrentSearchContext: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null;
  torrentSearchQuery: string;
  setTorrentSearchQuery: (q: string) => void;
  torrentPage: number;
  setTorrentPage: (p: number | ((prev: number) => number)) => void;
  torrentQualityFilter: string;
  setTorrentQualityFilter: (f: string) => void;
  torrentSourceFilter: string;
  setTorrentSourceFilter: (f: string) => void;
  torrentSizeFilter: string;
  setTorrentSizeFilter: (f: string) => void;
  torrentSort: "seeders" | "peers" | "size" | "age" | "confidence";
  torrentSortDir: "asc" | "desc";
  toggleSort: (
    col: "seeders" | "peers" | "size" | "age" | "confidence",
  ) => void;
  advancedSearch: boolean;
  committedQuery: string;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  torrentSearch: {
    isLoading: boolean;
    isAnyPending: boolean;
    isError: boolean;
    errorMessage?: string;
    refetch: () => void;
    indexers: Array<{
      id: string;
      name: string;
      status: "pending" | "success" | "error";
      count: number;
      tookMs: number | null;
      errorMessage: string | null;
    }>;
  };
  paginatedTorrents: TorrentResult[];
  allFilteredTorrents: TorrentResult[];
  hasMore: boolean;
  handleDownload: (url: string, title: string) => void;
  downloadTorrent: { isPending: boolean };
  setLastDownloadAttempt: (v: { url: string; title: string } | null) => void;
}

export function TorrentResults({
  mediaId: _mediaId,
  mediaTitle,
  torrentSearchContext,
  torrentSearchQuery,
  setTorrentSearchQuery,
  torrentPage,
  setTorrentPage,
  torrentQualityFilter,
  setTorrentQualityFilter,
  torrentSourceFilter,
  setTorrentSourceFilter,
  torrentSizeFilter,
  setTorrentSizeFilter,
  torrentSort,
  torrentSortDir,
  toggleSort,
  advancedSearch,
  committedQuery,
  mobileFiltersOpen,
  setMobileFiltersOpen,
  torrentSearch,
  paginatedTorrents,
  allFilteredTorrents,
  hasMore,
  handleDownload,
  downloadTorrent,
  setLastDownloadAttempt: _setLastDownloadAttempt,
}: TorrentResultsProps): React.JSX.Element {
  const resetPage = (): void => setTorrentPage(0);

  return (
    <div className="flex h-full flex-col">
      <FilterToolbar
        search={{
          value: torrentSearchQuery,
          onChange: setTorrentSearchQuery,
        }}
        filters={{
          quality: torrentQualityFilter,
          setQuality: setTorrentQualityFilter,
          source: torrentSourceFilter,
          setSource: setTorrentSourceFilter,
          size: torrentSizeFilter,
          setSize: setTorrentSizeFilter,
        }}
        sort={{
          column: torrentSort,
          dir: torrentSortDir,
          toggle: toggleSort,
        }}
        mobileOpen={mobileFiltersOpen}
        onToggleMobile={() => setMobileFiltersOpen((o) => !o)}
        onResetPage={resetPage}
      />

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {torrentSearch.isLoading ? (
          <ScanningState
            mediaTitle={mediaTitle}
            torrentSearchContext={torrentSearchContext}
            advancedSearch={advancedSearch}
            committedQuery={committedQuery}
            indexers={torrentSearch.indexers}
          />
        ) : torrentSearch.isError ? (
          <StateMessage
            preset="errorSearch"
            onRetry={() => void torrentSearch.refetch()}
            minHeight="240px"
          />
        ) : paginatedTorrents.length > 0 ? (
          <div className="flex flex-col gap-3 px-5 py-4">
            {paginatedTorrents.map((t, i) => (
              <TorrentCard
                key={`${t.guid}-${i}`}
                torrent={t}
                onDownload={handleDownload}
                downloadDisabled={downloadTorrent.isPending}
              />
            ))}
          </div>
        ) : advancedSearch && !committedQuery ? (
          <StateMessage
            icon={Search}
            title="Awaiting coordinates"
            description="Type a query and press Enter to scan every indexer."
            minHeight="240px"
          />
        ) : (
          <StateMessage preset="emptySearch" minHeight="240px" />
        )}
      </div>

      {/* Pagination footer */}
      {(torrentPage > 0 || hasMore) && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">
            Page {torrentPage + 1}
            {allFilteredTorrents.length > 0 && (
              <>
                {" "}
                &middot; {allFilteredTorrents.length} result
                {allFilteredTorrents.length !== 1 ? "s" : ""}
              </>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={torrentPage === 0}
              onClick={() => setTorrentPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!hasMore}
              onClick={() => setTorrentPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
