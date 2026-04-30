"use client";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Telescope } from "lucide-react";
import { SPACE_STATES  } from "../presets/space-states";
import type {SpaceStateKey} from "../presets/space-states";

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
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-muted-foreground/20" />
        </div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
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
        <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
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
