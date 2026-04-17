"use client";

import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Switch } from "@canto/ui/switch";

const SECTION_TYPES: Record<string, string> = {
  stats_dashboard: "Narrative",
  taste_map: "Narrative",
  insights: "Narrative",
  top_favorites: "Carousel",
  currently_watching: "Carousel",
  recent_ratings: "Carousel",
  watchlist_launchpad: "Carousel",
  recent_activity: "Carousel",
  dropped_ships: "Carousel",
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  stats_dashboard: "Time, movies, shows, countries",
  taste_map: "Genre identity, decade, taste profile",
  insights: "Rating patterns, hidden gems",
  top_favorites: "Favorited titles",
  currently_watching: "In-progress titles",
  recent_ratings: "Latest verdicts",
  watchlist_launchpad: "Queued titles",
  recent_activity: "Recent activity",
  dropped_ships: "Abandoned titles",
};

interface ProfileSectionRowProps {
  section: {
    id?: string;
    position: number;
    sectionKey: string;
    title: string;
    enabled: boolean;
  };
  isDragTarget: boolean;
  onDelete: () => void;
  onToggleEnabled: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ProfileSectionRow({
  section,
  isDragTarget,
  onDelete,
  onToggleEnabled,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: ProfileSectionRowProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-3 py-3 transition-all",
        isDragTarget
          ? "border-dashed border-primary bg-primary/5"
          : "border-border bg-card hover:border-border",
        !section.enabled && "opacity-50",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical size={18} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium text-foreground">
          {section.title}
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {SECTION_TYPES[section.sectionKey] ?? "Section"}
          </span>
          <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {SECTION_DESCRIPTIONS[section.sectionKey] ?? section.sectionKey}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Switch
          checked={section.enabled}
          onCheckedChange={onToggleEnabled}
          className="scale-75"
        />
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
