"use client";

import { cn } from "@canto/ui/cn";
import { MediaCard, MediaCardSkeleton } from "./media-card";
import { StateMessage } from "~/components/layout/state-message";

interface MediaItem {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
  overview?: string | null;
  totalRating?: number;
  voteCount?: number;
}

interface MediaGridProps {
  items: MediaItem[];
  isLoading?: boolean;
  skeletonCount?: number;
  compact?: boolean;
  className?: string;
}

const DEFAULT_COLS = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6";
const COMPACT_COLS = "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export function MediaGrid({
  items,
  isLoading = false,
  skeletonCount = 12,
  compact = false,
  className,
}: MediaGridProps): React.JSX.Element {
  const cols = compact ? COMPACT_COLS : DEFAULT_COLS;

  if (isLoading) {
    return (
      <div className={cn("grid gap-6", cols, className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <StateMessage preset="emptyGrid" minHeight="300px" />;
  }

  return (
    <>
      <div className={cn("grid gap-6", cols, className)}>
        {items.map((item, i) => (
          <div key={item.id ?? `${item.provider}-${item.externalId}-${i}`} className="relative">
            <MediaCard
              {...item}
              showTypeBadge
              showRating={false}
              showYear={false}
              showTitle={false}
            />
            {item.totalRating != null && item.voteCount != null && item.voteCount > 0 && (
              <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5">
                <span className="text-xs font-bold text-primary-foreground">{item.totalRating}</span>
                <span className="text-[10px] text-primary-foreground/70">
                  ({item.voteCount})
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
