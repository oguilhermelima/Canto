"use client";

import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Switch } from "@canto/ui/switch";

const SECTION_DESCRIPTIONS: Record<string, string> = {
  stats_dashboard: "Your watching journey — time, movies, shows, countries",
  taste_map: "Genre identity, decade sweet spot, taste profile",
  insights: "How you rate, hidden gems, unpopular opinions",
  top_favorites: "Your favorited titles showcase",
  currently_watching: "Titles you're mid-voyage on",
  recent_ratings: "Your latest verdicts",
  watchlist_launchpad: "Titles queued and waiting for launch",
  recent_activity: "What you've been up to",
  dropped_ships: "Titles that didn't survive the voyage",
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
          ? "border-dashed border-primary/50 bg-primary/5"
          : "border-border/40 bg-card hover:border-border",
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
        className="cursor-grab touch-none text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical size={18} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {section.title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {SECTION_DESCRIPTIONS[section.sectionKey] ?? section.sectionKey}
        </span>
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
