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
}

interface MediaGridProps {
  items: MediaItem[];
  isLoading?: boolean;
  skeletonCount?: number;
  compact?: boolean;
  className?: string;
}

const DEFAULT_COLS = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";
const COMPACT_COLS = "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

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
          <MediaCard
            key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
            {...item}
            showTypeBadge
            showRating={false}
            showYear={false}
            showTitle={false}
          />
        ))}
      </div>
      <StateMessage preset="endOfItems" inline />
    </>
  );
}
