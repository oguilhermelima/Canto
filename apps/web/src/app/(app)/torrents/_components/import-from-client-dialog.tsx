"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { ImportClientSelectMedia } from "./import-client-select-media";
import { ImportClientSelectTorrent } from "./import-client-select-torrent";
import type {
  ClientTorrentItem,
  ImportStep,
  MediaSearchItem,
} from "../_lib/import-types";
import type { ImportMatchMode } from "../_lib/infer-import-mode";

interface ImportFromClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importStep: ImportStep;
  onImportStepChange: (step: ImportStep) => void;

  clientSearch: string;
  onClientSearchChange: (value: string) => void;
  clientList: ClientTorrentItem[];
  clientListLoading: boolean;
  onSelectClient: (item: ClientTorrentItem) => void;

  selectedClientTorrent: ClientTorrentItem | null;

  importMatchMode: ImportMatchMode;
  onImportMatchModeChange: (mode: ImportMatchMode) => void;

  tmdbSearch: string;
  onTmdbSearchChange: (value: string) => void;
  debouncedTmdbSearch: string;
  searchResults: MediaSearchItem[];
  searchLoading: boolean;
  selectedMedia: MediaSearchItem | null;
  onSelectMedia: (item: MediaSearchItem | null) => void;

  seasonInput: string;
  onSeasonInputChange: (value: string) => void;
  episodeInput: string;
  onEpisodeInputChange: (value: string) => void;

  onSubmit: () => void;
  isPending: boolean;
}

export function ImportFromClientDialog(
  props: ImportFromClientDialogProps,
): React.JSX.Element {
  const filteredClientItems = filterClientItems(
    props.clientList,
    props.clientSearch,
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-[80vh] md:max-h-[80vh] md:max-w-2xl md:rounded-[2rem]">
        <DialogHeader className="px-5 pt-6 pb-4 text-left">
          <DialogTitle>Import from qBittorrent</DialogTitle>
          <DialogDescription>
            {props.importStep === "select-torrent"
              ? "Step 1/2 · Select a torrent from qBittorrent."
              : "Step 2/2 · Search and select the exact media item."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5">
          {props.importStep === "select-torrent" ? (
            <ImportClientSelectTorrent
              search={props.clientSearch}
              onSearchChange={props.onClientSearchChange}
              items={filteredClientItems}
              isLoading={props.clientListLoading}
              onSelect={props.onSelectClient}
            />
          ) : (
            <ImportClientSelectMedia
              selectedClientTorrent={props.selectedClientTorrent}
              importMatchMode={props.importMatchMode}
              onImportMatchModeChange={props.onImportMatchModeChange}
              tmdbSearch={props.tmdbSearch}
              onTmdbSearchChange={props.onTmdbSearchChange}
              debouncedTmdbSearch={props.debouncedTmdbSearch}
              searchResults={props.searchResults}
              searchLoading={props.searchLoading}
              selectedMedia={props.selectedMedia}
              onSelectMedia={props.onSelectMedia}
              seasonInput={props.seasonInput}
              onSeasonInputChange={props.onSeasonInputChange}
              episodeInput={props.episodeInput}
              onEpisodeInputChange={props.onEpisodeInputChange}
              onBack={() => props.onImportStepChange("select-torrent")}
              onSubmit={props.onSubmit}
              isPending={props.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function filterClientItems(
  items: ClientTorrentItem[],
  search: string,
): ClientTorrentItem[] {
  const trimmed = search.trim();
  if (!trimmed) return items;
  const q = trimmed.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(q));
}
