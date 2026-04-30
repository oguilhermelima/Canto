"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@canto/ui/select";
import {
  Search,
  ArrowRight,
  Library,
  ListTree,
  Sparkles,
  FolderOpen,
  Check
  
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
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
  mediaId: string;
  mediaType: "movie" | "show";
  isAdmin: boolean;
  seasons: Season[];
  selectedSeasons: Set<number>;
  setSelectedSeasons: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectedEpisodes: Set<string>;
  setSelectedEpisodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  hasSelection: boolean;
  selectedFolderId: string | undefined;
  setSelectedFolderId: (id: string | undefined) => void;
  onSearchGranular: () => void;
  onSearchAdvanced: (query: string) => void;
  onDownloadAuto: () => void;
}

type Mode = "full" | "seasons" | "custom";

export function DownloadTab({
  mediaId,
  mediaType,
  isAdmin,
  seasons,
  selectedSeasons,
  setSelectedSeasons,
  selectedEpisodes,
  setSelectedEpisodes,
  hasSelection,
  selectedFolderId,
  setSelectedFolderId,
  onSearchGranular,
  onSearchAdvanced,
  onDownloadAuto,
}: DownloadTabProps): React.JSX.Element {
  const isShow = mediaType === "show";
  const [mode, setMode] = useState<Mode>("full");
  const [customQuery, setCustomQuery] = useState("");

  const ctaDisabled =
    (mode === "seasons" && !hasSelection) ||
    (mode === "custom" && customQuery.trim().length === 0);

  const ctaLabel = mode === "custom" ? "Search torrents" : "Browse torrents";
  const ctaIcon = mode === "custom" ? Search : ArrowRight;

  const ctaHelper =
    mode === "seasons" && hasSelection
      ? buildSelectionSummary(selectedSeasons, selectedEpisodes)
      : mode === "seasons"
        ? "Pick at least one season or episode"
        : null;

  const handleCta = (): void => {
    if (mode === "full") {
      onDownloadAuto();
    } else if (mode === "seasons") {
      onSearchGranular();
    } else {
      const q = customQuery.trim();
      if (q) onSearchAdvanced(q);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {/* Mode cards */}
        <div
          className={cn(
            "grid gap-3",
            isShow ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
          )}
        >
          <ModeCard
            icon={Library}
            title={isShow ? "Full show" : "Full movie"}
            description={
              isShow
                ? "Search complete season packs"
                : "Auto-pick the best release"
            }
            selected={mode === "full"}
            onClick={() => setMode("full")}
          />
          {isShow && (
            <ModeCard
              icon={ListTree}
              title="By season"
              description="Pick specific seasons or episodes"
              selected={mode === "seasons"}
              onClick={() => setMode("seasons")}
            />
          )}
          <ModeCard
            icon={Sparkles}
            title="Custom"
            description="Free-form indexer query"
            selected={mode === "custom"}
            onClick={() => setMode("custom")}
          />
        </div>

        {/* Mode-specific expansion */}
        {mode !== "full" && (
          <div
            key={mode}
            className="mt-5 animate-in fade-in duration-150 ease-out"
          >
            {mode === "seasons" && (
              <SeasonSelect
                seasons={seasons}
                selectedSeasons={selectedSeasons}
                setSelectedSeasons={setSelectedSeasons}
                selectedEpisodes={selectedEpisodes}
                setSelectedEpisodes={setSelectedEpisodes}
              />
            )}
            {mode === "custom" && (
              <Input
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Search by release, group, codec, year…"
                variant="ghost"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customQuery.trim()) handleCta();
                }}
                className="h-11 rounded-xl"
              />
            )}
          </div>
        )}

        {/* Destination */}
        {isAdmin && (
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Destination
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <DestinationCard
              mediaId={mediaId}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
            />
          </div>
        )}
      </div>

      {/* CTA footer */}
      <div className="shrink-0 border-t border-border bg-background px-5 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <span className="truncate text-xs text-muted-foreground">
            {ctaHelper ?? " "}
          </span>
          <button
            disabled={ctaDisabled}
            onClick={handleCta}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-foreground px-6 text-sm font-semibold text-background transition-all hover:bg-foreground/90 disabled:opacity-40"
          >
            {ctaLabel}
            {(() => {
              const Icon = ctaIcon;
              return <Icon className="h-4 w-4" />;
            })()}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Mode card ─── */

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-full flex-col items-start gap-3 rounded-2xl border p-4 text-left duration-150",
        "transition-[background-color,border-color,box-shadow]",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-muted/20 hover:border-muted-foreground/40 hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-150",
          selected
            ? "bg-primary/15 text-primary"
            : "bg-background text-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
      {selected && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}

/* ─── Destination Card ─── */

const AUTO_VALUE = "__auto__";

function DestinationCard({
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

  const isAuto = !selectedFolderId;
  const activeFolderId = selectedFolderId ?? resolved?.folderId ?? null;
  const activeFolder = activeFolderId
    ? enabledFolders.find((f) => f.id === activeFolderId)
    : null;
  const displayName = activeFolder?.name ?? "Unrouted";
  const displayPath =
    activeFolder?.downloadPath ?? activeFolder?.libraryPath ?? null;

  return (
    <Select
      value={selectedFolderId ?? AUTO_VALUE}
      onValueChange={(v) => onSelect(v === AUTO_VALUE ? undefined : v)}
    >
      <SelectTrigger
        className="group h-auto w-full cursor-pointer items-center gap-3 rounded-2xl border-0 bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-60"
        aria-label="Saving destination"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
          <FolderOpen size={18} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            {isAuto && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Sparkles size={9} />
                Auto
              </span>
            )}
          </div>
          {displayPath && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {displayPath}
            </span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_VALUE}>
          {resolved?.folderName ? `Auto · ${resolved.folderName}` : "Auto"}
        </SelectItem>
        {enabledFolders.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ─── Helpers ─── */

function buildSelectionSummary(
  selectedSeasons: Set<number>,
  selectedEpisodes: Set<string>,
): string {
  const parts: string[] = [];
  if (selectedSeasons.size > 0) {
    parts.push(
      `${selectedSeasons.size} season${selectedSeasons.size !== 1 ? "s" : ""}`,
    );
  }
  if (selectedEpisodes.size > 0) {
    parts.push(
      `${selectedEpisodes.size} episode${selectedEpisodes.size !== 1 ? "s" : ""}`,
    );
  }
  return parts.length > 0 ? parts.join(" + ") : "No selection";
}
