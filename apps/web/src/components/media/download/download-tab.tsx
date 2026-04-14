"use client";

import { useState } from "react";
import { Input } from "@canto/ui/input";
import {
  Search,
  ArrowRight,
} from "lucide-react";
import { SeasonSelect } from "./season-select";

interface Season {
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
}

interface DownloadTabProps {
  mediaType: "movie" | "show";
  seasons: Season[];
  selectedSeasons: Set<number>;
  setSelectedSeasons: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectedEpisodes: Set<string>;
  setSelectedEpisodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  hasSelection: boolean;
  onSearchGranular: () => void;
  onSearchAdvanced: (query: string) => void;
  onDownloadAuto: () => void;
}

export function DownloadTab({
  mediaType,
  seasons,
  selectedSeasons,
  setSelectedSeasons,
  selectedEpisodes,
  setSelectedEpisodes,
  hasSelection,
  onSearchGranular,
  onSearchAdvanced,
  onDownloadAuto,
}: DownloadTabProps): React.JSX.Element {
  const [advancedQuery, setAdvancedQuery] = useState("");

  // Selection summary
  const totalSeasons = selectedSeasons.size;
  const totalEpisodes = selectedEpisodes.size;
  const summaryParts: string[] = [];
  if (totalSeasons > 0)
    summaryParts.push(
      `${totalSeasons} season${totalSeasons !== 1 ? "s" : ""}`,
    );
  if (totalEpisodes > 0)
    summaryParts.push(
      `${totalEpisodes} episode${totalEpisodes !== 1 ? "s" : ""}`,
    );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ─── Full Show / Full Movie ─── */}
      <section className="border-b border-border/40 px-5 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              {mediaType === "show" ? "Full Show" : "Full Movie"}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mediaType === "show"
                ? "Search for full series packs across all seasons."
                : "Search for the best available torrent."}
            </p>
          </div>
          <button
            onClick={onDownloadAuto}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            <Search className="h-3.5 w-3.5" />
            Browse
          </button>
        </div>
      </section>

      {/* ─── Granular (shows only) ─── */}
      {mediaType === "show" && (
        <section className="border-b border-border/40 px-5 py-5">
          <SeasonSelect
            seasons={seasons}
            selectedSeasons={selectedSeasons}
            setSelectedSeasons={setSelectedSeasons}
            selectedEpisodes={selectedEpisodes}
            setSelectedEpisodes={setSelectedEpisodes}
          />

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {hasSelection ? summaryParts.join(" + ") : "No selection"}
            </span>
            <button
              disabled={!hasSelection}
              onClick={onSearchGranular}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
            >
              Browse
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* ─── Advanced ─── */}
      <section className="px-5 py-5">
        <h3 className="text-base font-semibold text-foreground">
          Advanced
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Search with a custom query across all indexers.
        </p>

        <div className="mt-3 flex gap-2">
          <Input
            value={advancedQuery}
            onChange={(e) => setAdvancedQuery(e.target.value)}
            placeholder="e.g. Solo Leveling Season 1 1080p"
            variant="ghost"
            onKeyDown={(e) => {
              if (e.key === "Enter" && advancedQuery.trim()) {
                onSearchAdvanced(advancedQuery.trim());
              }
            }}
          />
          <button
            disabled={!advancedQuery.trim()}
            onClick={() => onSearchAdvanced(advancedQuery.trim())}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        </div>
      </section>
    </div>
  );
}
