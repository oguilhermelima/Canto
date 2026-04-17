"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import {
  X,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { useDownloadModal } from "./use-download-modal";
import { DownloadTab } from "./download-tab";
import { TorrentResults } from "./torrent-results";

interface DownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string | undefined;
  mediaType: "movie" | "show";
  mediaTitle: string;
  isAdmin: boolean;
  seasons: Array<{
    id: string;
    number: number;
    name: string | null;
    episodeCount: number | null;
    airDate: string | null;
    episodes: Array<{
      id: string;
      number: number;
      title: string | null;
      overview?: string | null;
      stillPath?: string | null;
      airDate?: string | null;
      runtime?: number | null;
    }>;
  }>;
}

export function DownloadModal({
  open,
  onOpenChange,
  mediaId,
  mediaType,
  mediaTitle,
  isAdmin,
  seasons,
}: DownloadModalProps): React.JSX.Element {
  const modal = useDownloadModal(mediaId, mediaType, open);

  useEffect(() => {
    if (!open) modal.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const showingResults = modal.step === 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:max-w-3xl md:rounded-[2rem] [&>button:last-child]:hidden ${showingResults ? "md:h-[65vh] md:max-h-[65vh]" : mediaType === "show" ? "md:h-auto md:min-h-[50vh] md:max-h-[65vh]" : "md:h-auto md:max-h-[65vh]"}`}>
        {/* Header — fixed two-row height on both screens */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            {showingResults && (
              <button
                onClick={modal.goBackToStep1}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <DialogHeader className="p-0">
                <DialogTitle className="truncate text-lg font-semibold leading-7">
                  {showingResults ? (
                    <>
                      {mediaTitle}
                      {modal.torrentSearchContext?.seasonNumber !== undefined && (
                        <span className="text-muted-foreground">
                          {" "}— S{String(modal.torrentSearchContext.seasonNumber).padStart(2, "0")}
                          {modal.torrentSearchContext.episodeNumbers &&
                            modal.torrentSearchContext.episodeNumbers.length > 0 && (
                              <span>
                                E{modal.torrentSearchContext.episodeNumbers
                                  .map((n) => String(n).padStart(2, "0"))
                                  .join(", E")}
                              </span>
                            )}
                        </span>
                      )}
                    </>
                  ) : (
                    <>Download — {mediaTitle}</>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-0.5 flex h-6 items-center gap-1.5 text-sm text-muted-foreground">
                  {showingResults ? (
                    <span>Search and download torrents</span>
                  ) : isAdmin && mediaId ? (
                    <LibrarySelector
                      mediaId={mediaId}
                      selectedFolderId={modal.selectedFolderId}
                      onSelect={modal.setSelectedFolderId}
                    />
                  ) : (
                    <span>Select what to download</span>
                  )}
                </DialogDescription>
              </DialogHeader>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!mediaId ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {!showingResults && (
                <DownloadTab
                  mediaType={mediaType}
                  seasons={seasons}
                  selectedSeasons={modal.selectedSeasons}
                  setSelectedSeasons={modal.setSelectedSeasons}
                  selectedEpisodes={modal.selectedEpisodes}
                  setSelectedEpisodes={modal.setSelectedEpisodes}
                  hasSelection={modal.hasSelection}
                  onSearchGranular={() => modal.goToStep2(seasons)}
                  onSearchAdvanced={(query) => {
                    modal.setAdvancedSearch(true);
                    modal.setAdvancedQuery(query);
                    modal.setCommittedQuery(query);
                    modal.setTorrentSearchContext(null);
                    modal.setTorrentPage(0);
                    modal.setStep2Direct();
                  }}
                  onDownloadAuto={() => {
                    modal.setTorrentSearchContext(null);
                    modal.setAdvancedSearch(false);
                    modal.setTorrentPage(0);
                    modal.setStep2Direct();
                  }}
                />
              )}

              {showingResults && (
                <TorrentResults
                  mediaId={mediaId}
                  mediaTitle={mediaTitle}
                  torrentSearchQuery={modal.torrentSearchQuery}
                  setTorrentSearchQuery={modal.setTorrentSearchQuery}
                  torrentPage={modal.torrentPage}
                  setTorrentPage={modal.setTorrentPage}
                  torrentQualityFilter={modal.torrentQualityFilter}
                  setTorrentQualityFilter={modal.setTorrentQualityFilter}
                  torrentSourceFilter={modal.torrentSourceFilter}
                  setTorrentSourceFilter={modal.setTorrentSourceFilter}
                  torrentSizeFilter={modal.torrentSizeFilter}
                  setTorrentSizeFilter={modal.setTorrentSizeFilter}
                  torrentSort={modal.torrentSort}
                  torrentSortDir={modal.torrentSortDir}
                  toggleSort={modal.toggleSort}
                  advancedSearch={modal.advancedSearch}
                  committedQuery={modal.committedQuery}
                  mobileFiltersOpen={modal.mobileFiltersOpen}
                  setMobileFiltersOpen={modal.setMobileFiltersOpen}
                  torrentSearch={modal.torrentSearch}
                  paginatedTorrents={modal.paginatedTorrents}
                  allFilteredTorrents={modal.allFilteredTorrents}
                  hasMore={modal.hasMore}
                  handleDownload={modal.handleDownload}
                  downloadTorrent={modal.downloadTorrent}
                  setLastDownloadAttempt={modal.setLastDownloadAttempt}
                />
              )}
            </>
          )}
        </div>
      </DialogContent>

      {/* Replace confirmation */}
      <ConfirmationDialog
        open={!!modal.replaceConflict}
        onOpenChange={(open) => { if (!open) modal.dismissReplace(); }}
        title="Replace existing download?"
        description={modal.replaceConflict?.message}
        confirmLabel="Replace"
        loading={modal.replaceTorrent.isPending}
        onConfirm={() => modal.confirmReplace()}
      />
    </Dialog>
  );
}

/* ─── Library Selector ─── */

function LibrarySelector({
  mediaId,
  selectedFolderId,
  onSelect,
}: {
  mediaId: string;
  selectedFolderId: string | undefined;
  onSelect: (id: string | undefined) => void;
}): React.JSX.Element | null {
  const { data: folders } = trpc.folder.list.useQuery();
  const { data: resolved } = trpc.folder.resolve.useQuery({ mediaId });

  const enabledFolders = (folders ?? []).filter((f) => f.enabled);
  if (enabledFolders.length === 0) return null;

  const autoLabel = resolved?.folderName
    ? `Auto (${resolved.folderName})`
    : "Auto";

  return (
    <>
      <span>Saving to</span>
      <select
        value={selectedFolderId ?? ""}
        onChange={(e) => onSelect(e.target.value || undefined)}
        className="cursor-pointer rounded-md bg-muted/60 px-1.5 py-0.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted"
      >
        <option value="">{autoLabel}</option>
        {enabledFolders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </>
  );
}
