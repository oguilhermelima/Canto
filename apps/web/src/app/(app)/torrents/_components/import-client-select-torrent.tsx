"use client";

import { Search } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Skeleton } from "@canto/ui/skeleton";
import { StateMessage } from "@canto/ui/state-message";
import { formatBytes, formatEta, formatSpeed } from "@/lib/torrent-utils";
import type { ClientTorrentItem } from "../_lib/import-types";

const MODAL_INPUT_CN =
  "h-10 rounded-xl border-none bg-accent text-sm ring-0 focus-visible:ring-1 focus-visible:ring-primary/30";

function getClientStateLabel(state: string, progress: number): string {
  if (progress >= 1) return "Completed";
  if (state.includes("paused")) return "Paused";
  if (state.includes("stalled")) return "Stalled";
  if (state === "checkingDL" || state === "checkingUP" || state === "checkingResumeData") return "Checking";
  if (state === "error" || state === "missingFiles") return "Error";
  return "Downloading";
}

interface ImportClientSelectTorrentProps {
  search: string;
  onSearchChange: (value: string) => void;
  items: ClientTorrentItem[];
  isLoading: boolean;
  onSelect: (item: ClientTorrentItem) => void;
}

export function ImportClientSelectTorrent({
  search,
  onSearchChange,
  items,
  isLoading,
  onSelect,
}: ImportClientSelectTorrentProps): React.JSX.Element {
  return (
    <>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search torrents in qBittorrent..."
          className={`${MODAL_INPUT_CN} pl-9`}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <StateMessage preset="emptyTorrents" inline />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ClientTorrentRow key={item.hash} item={item} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ClientTorrentRow({
  item,
  onSelect,
}: {
  item: ClientTorrentItem;
  onSelect: (item: ClientTorrentItem) => void;
}): React.JSX.Element {
  const tracked = item.tracked && item.trackedMediaId !== null;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {item.name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{getClientStateLabel(item.state, item.progress)}</span>
            <span>{Math.round(item.progress * 100)}%</span>
            {item.size > 0 && <span>{formatBytes(item.size)}</span>}
            {item.dlspeed > 0 && <span>↓ {formatSpeed(item.dlspeed)}</span>}
            {item.upspeed > 0 && <span>↑ {formatSpeed(item.upspeed)}</span>}
            {item.eta > 0 && item.eta < 8640000 && (
              <span>ETA {formatEta(item.eta)}</span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          className="rounded-xl"
          variant={tracked ? "outline" : "default"}
          disabled={tracked}
          onClick={() => onSelect(item)}
        >
          {tracked ? "Imported" : "Select"}
        </Button>
      </div>
    </div>
  );
}
