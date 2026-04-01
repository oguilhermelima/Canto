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
    "inline-flex items-center gap-1 rounded-md font-medium backdrop-blur-sm",
    isSm
      ? "px-1.5 py-0.5 text-[10px]"
      : "px-2 py-0.5 text-xs",
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {voteAverage != null && voteAverage > 0 && (
        <span className={cn(badgeBase, "bg-yellow-500/20 text-yellow-500")}>
          <Star className={cn("fill-current", isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
          {voteAverage.toFixed(1)}
        </span>
      )}
      {year && (
        <span className={cn(badgeBase, "bg-white/10 text-white/80")}>
          <Calendar className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
          {year}
        </span>
      )}
      {type && (
        <span className={cn(badgeBase, "bg-white/10 text-white/80 uppercase tracking-wide")}>
          {type === "movie" ? (
            <>
              <Film className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
              Movie
            </>
          ) : (
            <>
              <Tv className={cn(isSm ? "h-2.5 w-2.5" : "h-3 w-3")} />
              TV Show
            </>
          )}
        </span>
      )}
    </div>
  );
}
