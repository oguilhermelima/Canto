"use client";

import { Star, Calendar, Film, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";

interface MediaBadgesProps {
  type?: "movie" | "show";
  year?: number | null;
  voteAverage?: number | null;
  size?: "sm" | "md";
  className?: string;
}

export function MediaBadges({
  type,
  year,
  voteAverage,
  size = "md",
  className,
}: MediaBadgesProps): React.JSX.Element {
  const isSm = size === "sm";
  const badgeBase = cn(
    "inline-flex items-center gap-1.5 rounded-xl font-semibold capitalize",
    isSm
      ? "px-2.5 py-1 text-[11px]"
      : "px-3 py-1.5 text-xs",
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {/* 1. Type — identify what it is */}
      {type && (
        <span className={cn(badgeBase, "bg-black/90 text-white")}>
          {type === "movie" ? (
            <>
              <Film className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
              Movie
            </>
          ) : (
            <>
              <Tv className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
              Tv Show
            </>
          )}
        </span>
      )}
      {/* 2. Rating — how good */}
      {voteAverage != null && voteAverage > 0 && (
        <span className={cn(badgeBase, "bg-yellow-500/90 text-black")}>
          <Star className={cn("fill-current", isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
          {voteAverage.toFixed(1)}
        </span>
      )}
      {/* 3. Year — when */}
      {year && (
        <span className={cn(badgeBase, "bg-black/90 text-white")}>
          <Calendar className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
          {year}
        </span>
      )}
    </div>
  );
}
