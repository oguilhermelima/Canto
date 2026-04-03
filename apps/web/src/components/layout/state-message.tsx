"use client";

import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import {
  Orbit,
  Rocket,
  Telescope,
  Radio,
  Satellite,
  SatelliteDish,
  MapPinOff,
} from "lucide-react";

/* ─── Space-themed presets ─── */

export const SPACE_STATES = {
  // Empty states — frame as "unexplored", never "empty"
  emptyWatchlist: {
    icon: Telescope,
    title: "Uncharted territory",
    description: "Point your telescope at something new — explore and save media to watch later.",
  },
  emptyCollections: {
    icon: Orbit,
    title: "No constellations yet",
    description: "Group your favorite stars together — create your first collection.",
  },
  emptyServerLibrary: {
    icon: Satellite,
    title: "Awaiting first signal",
    description: "Downloaded media will dock here once it arrives.",
  },
  emptyList: {
    icon: Rocket,
    title: "Ready for launch",
    description: "This collection is fueled up — start adding media to fill its orbit.",
  },
  emptySearch: {
    icon: Radio,
    title: "No transmissions found",
    description: "Try different frequencies — adjust your keywords or check the spelling.",
  },
  emptyRequests: {
    icon: SatelliteDish,
    title: "All clear on comms",
    description: "No incoming requests at this station.",
  },
  emptyRequestsUser: {
    icon: SatelliteDish,
    title: "All clear on comms",
    description: "You haven't sent any requests yet — browse media and request what you'd like.",
  },
  emptyTorrents: {
    icon: Satellite,
    title: "Docking bay is clear",
    description: "Downloads from media pages will appear here with real-time telemetry.",
  },
  emptyNotifications: {
    icon: Radio,
    title: "Radio silence",
    description: "Transmissions about downloads, imports, and updates will appear here.",
  },
  emptyDownloads: {
    icon: Satellite,
    title: "No active missions",
    description: "All spacecraft have landed — no downloads in progress.",
  },
  emptyPerson: {
    icon: MapPinOff,
    title: "Coordinates unknown",
    description: "This crew member wasn't found in any star chart.",
  },
  emptyGrid: {
    icon: Telescope,
    title: "No signals in this sector",
    description: "Try adjusting your filters or scanning a different region.",
  },
  emptyFiltered: {
    icon: Telescope,
    title: "No matching signals",
    description: "Try adjusting your filters to widen the search area.",
  },

  // Error states — hopeful, mission-control vibe
  error: {
    icon: SatelliteDish,
    title: "Signal interference",
    description: "Mission control lost the connection — let's try re-establishing.",
  },
  errorSearch: {
    icon: Radio,
    title: "Transmission disrupted",
    description: "Something scrambled the signal — give it another shot.",
  },
  errorMedia: {
    icon: SatelliteDish,
    title: "Telemetry interrupted",
    description: "We lost the data feed — mission control is on standby.",
  },

  // End of items — adventurous
  endOfItems: {
    icon: Rocket,
    title: "Edge of the galaxy",
    description: "You've explored everything in this sector.",
  },

  // Not found
  notFound: {
    icon: MapPinOff,
    title: "Off the star chart",
    description: "These coordinates don't match any known location.",
  },
  notFoundList: {
    icon: MapPinOff,
    title: "Lost signal",
    description: "This collection may have been moved or removed from the star chart.",
  },
} as const;

type SpaceStateKey = keyof typeof SPACE_STATES;

/* ─── Component ─── */

interface StateMessageProps {
  /** Use a preset by key, or provide custom icon/title/description */
  preset?: SpaceStateKey;
  icon?: React.ElementType;
  title?: string;
  description?: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Retry button (shows separately from action) */
  onRetry?: () => void;
  /** Minimum height of the container */
  minHeight?: string;
  /** Compact inline variant — subtle divider with text, no large icon */
  inline?: boolean;
  className?: string;
}

export function StateMessage({
  preset,
  icon: iconProp,
  title: titleProp,
  description: descProp,
  action,
  onRetry,
  minHeight = "300px",
  inline = false,
  className,
}: StateMessageProps): React.JSX.Element {
  const presetData = preset ? SPACE_STATES[preset] : undefined;
  const Icon = iconProp ?? presetData?.icon ?? Telescope;
  const title = titleProp ?? presetData?.title ?? "Uncharted territory";
  const description = descProp ?? presetData?.description;

  if (inline) {
    return (
      <div className={cn("flex flex-col items-center gap-4 py-16", className)}>
        <div className="flex items-center gap-4 w-full max-w-xs">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-muted-foreground/20" />
          <div className="relative flex h-10 w-10 items-center justify-center">
            <div className="absolute inset-0 animate-[spin_12s_linear_infinite] rounded-full border border-dashed border-muted-foreground/15" />
            <div className="absolute inset-1 animate-[spin_8s_linear_infinite_reverse] rounded-full border border-dashed border-muted-foreground/10" />
            <Icon className="h-4 w-4 text-muted-foreground/40" />
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-muted-foreground/20" />
        </div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground/40">
          {title}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        className,
      )}
      style={{ minHeight }}
    >
      <div className="text-center">
        <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
        <p className="text-lg font-medium text-muted-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground/70">
            {description}
          </p>
        )}
        {(action || onRetry) && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
            {action && (
              <Button
                size="sm"
                className="rounded-xl"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
