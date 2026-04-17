"use client";

import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { ImportMediaResults } from "./import-media-results";
import type {
  ClientTorrentItem,
  MediaSearchItem,
} from "../_lib/import-types";
import type { ImportMatchMode } from "../_lib/infer-import-mode";

const MODAL_INPUT_CN =
  "h-10 rounded-xl border-none bg-accent text-sm ring-0 focus-visible:ring-1 focus-visible:ring-primary/30";

const MATCH_MODES: { value: ImportMatchMode; label: string }[] = [
  { value: "movie", label: "Movie" },
  { value: "series", label: "Series" },
  { value: "episode", label: "Episode" },
];

interface ImportClientSelectMediaProps {
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

  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function ImportClientSelectMedia(
  props: ImportClientSelectMediaProps,
): React.JSX.Element {
  const showSeasonInput =
    props.importMatchMode === "series" || props.importMatchMode === "episode";
  return (
    <>
      <div className="rounded-xl border border-border bg-accent/40 p-3">
        <p className="text-xs text-muted-foreground">Selected torrent</p>
        <p className="truncate text-sm font-semibold text-foreground">
          {props.selectedClientTorrent?.name}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MATCH_MODES.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            className="rounded-xl"
            variant={props.importMatchMode === value ? "default" : "outline"}
            onClick={() => {
              props.onImportMatchModeChange(value);
              props.onSelectMedia(null);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.tmdbSearch}
          onChange={(e) => props.onTmdbSearchChange(e.target.value)}
          placeholder="Search on TMDB..."
          className={`${MODAL_INPUT_CN} pl-9`}
        />
      </div>

      {showSeasonInput && (
        <div className={props.importMatchMode === "episode" ? "grid grid-cols-2 gap-2" : ""}>
          <Input
            value={props.seasonInput}
            onChange={(e) => props.onSeasonInputChange(e.target.value)}
            placeholder={props.importMatchMode === "episode" ? "Season" : "Season (optional)"}
            className={MODAL_INPUT_CN}
          />
          {props.importMatchMode === "episode" && (
            <Input
              value={props.episodeInput}
              onChange={(e) => props.onEpisodeInputChange(e.target.value)}
              placeholder="Episode (e.g. 3 or 3,4)"
              className={MODAL_INPUT_CN}
            />
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ImportMediaResults
          isLoading={props.searchLoading}
          hasQuery={props.debouncedTmdbSearch.trim().length >= 2}
          results={props.searchResults}
          selectedMedia={props.selectedMedia}
          onSelect={props.onSelectMedia}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={props.onBack}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          className="rounded-xl"
          disabled={props.isPending || !props.selectedMedia}
          onClick={props.onSubmit}
        >
          {props.isPending ? "Importing..." : "Import"}
        </Button>
      </div>
    </>
  );
}
