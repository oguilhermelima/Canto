"use client";

import { useState  } from "react";
import type {ReactNode} from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@canto/ui/cn";

export interface SettingsGroupCardProps {
  title: string;
  /** Small icon shown before the title (e.g. provider logo). */
  icon?: ReactNode;
  /** Badge(s) shown next to the title (e.g. "Required", "Connected"). */
  badge?: ReactNode;
  /** Short description shown at the top of the card body when open. */
  description?: string;
  /** Whether the card starts expanded. Defaults to true. */
  defaultOpen?: boolean;
  /** Extra className on the header (provider-specific gradient, etc.). */
  headerClassName?: string;
  /** Content that goes inside the collapsible body. */
  children: ReactNode;
  /** Optional content rendered below the main body (test buttons, links). */
  footer?: ReactNode;
}

/**
 * Visual wrapper for a settings group: collapsible header with icon/badge,
 * card body containing either a `<SettingsGroupForm>` or hand-crafted
 * fields. Keeps the visual language consistent across all settings sections.
 */
export function SettingsGroupCard({
  title,
  icon,
  badge,
  description,
  defaultOpen = true,
  headerClassName,
  children,
  footer,
}: SettingsGroupCardProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/30",
          headerClassName,
        )}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
            !open && "-rotate-90",
          )}
        />
        {icon}
        <p className="truncate text-base font-semibold text-foreground">
          {title}
        </p>
        {badge && <div className="ml-auto flex items-center gap-2">{badge}</div>}
      </button>

      {open && (
        <div className="space-y-4 px-5 pb-5 pt-1">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {children}
          {footer && <div className="pt-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}
