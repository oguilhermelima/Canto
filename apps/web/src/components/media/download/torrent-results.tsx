"use client";

import { useEffect, useMemo, useRef } from "react";
import { StateMessage } from "@canto/ui/state-message";
import { Loader2, Search } from "lucide-react";
import { FilterToolbar } from "./filter-toolbar";
import { ScanningState } from "./scanning-state";
import { TorrentCard  } from "./torrent-card";
import type {TorrentResult} from "./torrent-card";

interface TorrentResultsProps {
  mediaId: string;
  mediaTitle: string;
  torrentSearchContext: {
    seasonNumber?: number;
    episodeNumbers?: number[];
  } | null;
  torrentSearchQuery: string;
  setTorrentSearchQuery: (q: string) => void;
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
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => void;
  };
  visibleTorrents: TorrentResult[];
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
  visibleTorrents,
  handleDownload,
  downloadTorrent,
  setLastDownloadAttempt: _setLastDownloadAttempt,
}: TorrentResultsProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver — when the sentinel approaches the viewport
  // bottom, request the next page from every indexer that hasn't
  // exhausted yet. Bound to the scrollable container so it works inside
  // the modal's flex layout. `rootMargin` fires the load slightly before
  // the sentinel is fully visible to feel seamless.
  useEffect(() => {
    if (!torrentSearch.hasMore) return;
    if (torrentSearch.isLoadingMore) return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          torrentSearch.loadMore();
        }
      },
      { root, rootMargin: "200px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [torrentSearch]);

  // Distinct sub-trackers contributing to the visible result set.
  // Prowlarr is the only local indexer, so the per-indexer chip is always
  // 1/1 — the meaningful breadth metric is how many sub-trackers (BitSearch,
  // Knaben, LimeTorrents…) actually returned releases that survived the
  // intent filter.
  const trackerCount = useMemo(
    () => new Set(visibleTorrents.map((t) => t.indexer)).size,
    [visibleTorrents],
  );

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
      />

      {/* Results */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
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
        ) : visibleTorrents.length > 0 ? (
          <div className="flex flex-col gap-3 px-5 py-4">
            {visibleTorrents.map((t, i) => (
              <TorrentCard
                key={`${t.guid}-${i}`}
                torrent={t}
                onDownload={handleDownload}
                downloadDisabled={downloadTorrent.isPending}
              />
            ))}

            {/* Infinite-scroll sentinel + loading indicator */}
            {torrentSearch.hasMore && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-4"
              >
                {torrentSearch.isLoadingMore && (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sweeping deeper…
                  </span>
                )}
              </div>
            )}
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

      {/* Footer counter */}
      {visibleTorrents.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span>
            {visibleTorrents.length} result
            {visibleTorrents.length !== 1 ? "s" : ""}
            {trackerCount > 0 && (
              <>
                {" · "}
                {trackerCount} tracker{trackerCount !== 1 ? "s" : ""}
              </>
            )}
          </span>
          {torrentSearch.isAnyPending && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              still scanning
            </span>
          )}
        </div>
      )}
    </div>
  );
}
