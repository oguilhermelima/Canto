"use client";

import { cn } from "@canto/ui/cn";
import { Switch } from "@canto/ui/switch";

const SECTION_TYPES: Record<string, string> = {
  year_in_progress: "Overview",
  recent_completions: "Overview",
  currently_watching: "Overview",
  top_favorites: "Overview",
  watchlist_launchpad: "Overview",
  recent_activity: "Overview",
  stats_dashboard: "Stats",
  taste_map: "Stats",
  insights: "Stats",
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  year_in_progress: "Hero with this year's count, top genre, and recent poster deck",
  recent_completions: "Filmstrip of recently completed titles",
  currently_watching: "Carousel of titles you're mid-voyage on",
  top_favorites: "Your four favorites, canon-style",
  watchlist_launchpad: "On-deck grid of planned titles",
  recent_activity: "Backdrop cards with your latest tracked actions",
  stats_dashboard: "Total time, movies, shows, countries",
  taste_map: "Genre identity, decade sweet spot",
  insights: "Rating voice, histogram, hidden gems",
};

interface ProfileSectionRowProps {
  section: {
    id?: string;
    position: number;
    sectionKey: string;
    title: string;
    enabled: boolean;
  };
  onToggleEnabled: () => void;
}

export function ProfileSectionRow({
  section,
  onToggleEnabled,
}: ProfileSectionRowProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-opacity",
        !section.enabled && "opacity-50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {section.title}
          </span>
          <span className="inline-flex shrink-0 items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {SECTION_TYPES[section.sectionKey] ?? "Section"}
          </span>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {SECTION_DESCRIPTIONS[section.sectionKey] ?? section.sectionKey}
        </span>
      </div>

      <Switch
        checked={section.enabled}
        onCheckedChange={onToggleEnabled}
        className="scale-75"
      />
    </div>
  );
}
