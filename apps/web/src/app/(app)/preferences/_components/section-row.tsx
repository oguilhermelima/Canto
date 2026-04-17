"use client";

import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Switch } from "@canto/ui/switch";

const STYLE_LABELS: Record<string, string> = {
  spotlight: "Spotlight",
  large_video: "Large Video",
  card: "Card",
  cover: "Cover",
};

const SOURCE_LABELS: Record<string, string> = {
  spotlight: "Spotlight",
  recommendations: "Recommendations",
  continue_watching: "Continue Watching",
  watch_next: "Watch Next",
  recently_added: "Recently Added",
  collection: "Collection",
  trending: "Trending",
  discover: "Discover",
};

interface SectionRowProps {
  section: {
    id?: string;
    position: number;
    title: string;
    style: string;
    sourceType: string;
    sourceKey: string;
    enabled: boolean;
  };
  isDragTarget: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function SectionRow({
  section,
  isDragTarget,
  onEdit,
  onDelete,
  onToggleEnabled,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: SectionRowProps): React.JSX.Element {
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
            {STYLE_LABELS[section.style] ?? section.style}
          </span>
          <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {section.sourceType === "db" ? "Library" : "TMDB"} · {SOURCE_LABELS[section.sourceKey] ?? section.sourceKey}
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
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil size={14} />
        </button>
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
