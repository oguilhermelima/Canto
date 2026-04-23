"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canto/ui/tooltip";
import { cn } from "@canto/ui/cn";
import { Bookmark, Eye } from "lucide-react";

export interface MembershipInfo {
  inWatchlist: boolean;
  otherCollections: Array<{ id: string; name: string; slug: string }>;
}

interface MembershipBadgesProps {
  membership: MembershipInfo | null | undefined;
  variant?: "grid" | "list";
  className?: string;
}

export function MembershipBadges({
  membership,
  variant = "grid",
  className,
}: MembershipBadgesProps): React.JSX.Element | null {
  if (!membership) return null;
  const { inWatchlist, otherCollections } = membership;
  const otherCount = otherCollections.length;
  if (!inWatchlist && otherCount === 0) return null;

  const tooltipLines: string[] = [];
  if (inWatchlist) tooltipLines.push("In Watchlist");
  if (otherCount > 0) {
    tooltipLines.push(
      otherCount === 1
        ? `Also in: ${otherCollections[0]!.name}`
        : `Also in ${otherCount} collections: ${otherCollections
            .map((c) => c.name)
            .join(", ")}`,
    );
  }

  const pillBase =
    "pointer-events-auto flex items-center gap-1 rounded-full text-[11px] font-semibold tabular-nums backdrop-blur-sm";
  const pillByVariant =
    variant === "grid"
      ? "bg-black/70 px-1.5 py-1 text-white"
      : "bg-muted px-2 py-0.5 text-foreground";

  const wrapperByVariant =
    variant === "grid"
      ? "absolute bottom-1.5 left-1.5 z-10"
      : "inline-flex";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(wrapperByVariant, className)}>
            <div className={cn(pillBase, pillByVariant)}>
              {inWatchlist && (
                <Eye className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
              )}
              {otherCount > 0 && (
                <>
                  {inWatchlist && (
                    <span className="h-3 w-px bg-white/20" aria-hidden />
                  )}
                  <Bookmark
                    className="h-3 w-3 text-amber-400"
                    strokeWidth={2.5}
                    fill="currentColor"
                  />
                  <span>+{otherCount}</span>
                </>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            {tooltipLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
