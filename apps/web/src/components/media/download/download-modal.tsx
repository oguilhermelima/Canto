"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { ConfirmationDialog } from "@canto/ui/confirmation-dialog";
import { X, Loader2, ArrowLeft } from "lucide-react";
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

  const showingResults = modal.step === 2;

  const handleOpenChange = (next: boolean): void => {
    if (!next) modal.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:max-w-3xl md:rounded-[2rem] [&>button:last-child]:hidden ${showingResults ? "md:h-[65vh] md:max-h-[65vh]" : mediaType === "show" ? "md:h-auto md:min-h-[50vh] md:max-h-[65vh]" : "md:h-auto md:max-h-[65vh]"}`}>
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
          {showingResults && (
            <button
              onClick={modal.goBackToStep1}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <DialogHeader className="min-w-0 flex-1 space-y-0 text-left">
            <DialogTitle className="truncate text-base font-semibold leading-none">
              {showingResults ? (
                <>
                  {mediaTitle ? mediaTitle : "Search and download torrents"}
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
              ) : mediaTitle ? (
                <>
                  <span className="text-muted-foreground">Download —</span>{" "}
                  {mediaTitle}
                </>
              ) : (
                <>Download</>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {showingResults
                ? `Search and download torrents for ${mediaTitle}`
                : "Select what to download"}
            </DialogDescription>
          </DialogHeader>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!mediaId ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !showingResults ? (
            <div
              key="step-picker"
              className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-left-3 duration-300 ease-out"
            >
              <DownloadTab
                mediaId={mediaId}
                mediaType={mediaType}
                isAdmin={isAdmin}
                seasons={seasons}
                selectedSeasons={modal.selectedSeasons}
                setSelectedSeasons={modal.setSelectedSeasons}
                selectedEpisodes={modal.selectedEpisodes}
                setSelectedEpisodes={modal.setSelectedEpisodes}
                hasSelection={modal.hasSelection}
                selectedFolderId={modal.selectedFolderId}
                setSelectedFolderId={modal.setSelectedFolderId}
                onSearchGranular={() => modal.goToStep2(seasons)}
                onSearchAdvanced={(query) => {
                  modal.setAdvancedSearch(true);
                  modal.setAdvancedQuery(query);
                  modal.setCommittedQuery(query);
                  modal.setTorrentSearchContext(null);
                  modal.setStep2Direct();
                }}
                onDownloadAuto={() => {
                  modal.setTorrentSearchContext(null);
                  modal.setAdvancedSearch(false);
                  modal.setStep2Direct();
                }}
              />
            </div>
          ) : (
            <div
              key="step-results"
              className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-3 duration-300 ease-out"
            >
              <TorrentResults
                mediaId={mediaId}
                mediaTitle={mediaTitle}
                torrentSearchContext={modal.torrentSearchContext}
                torrentSearchQuery={modal.torrentSearchQuery}
                setTorrentSearchQuery={modal.setTorrentSearchQuery}
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
                visibleTorrents={modal.visibleTorrents}
                handleDownload={modal.handleDownload}
                downloadTorrent={modal.downloadTorrent}
                setLastDownloadAttempt={modal.setLastDownloadAttempt}
              />
            </div>
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

