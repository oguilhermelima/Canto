"use client";

import { Film, Tv, Star } from "lucide-react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { FadeImage } from "~/components/ui/fade-image";
import { tmdbPosterLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";

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

interface MediaListViewProps {
  items: MediaItem[];
  isLoading?: boolean;
  skeletonCount?: number;
  compact?: boolean;
  className?: string;
}

export function MediaListItem({ item }: { item: MediaItem }): React.JSX.Element {
  const href = mediaHref(
    item.provider ?? "tmdb",
    item.externalId ?? item.id ?? "0",
    item.type,
  );

  return (
    <Link
      href={href}
      className="group flex gap-4 rounded-xl p-2 transition-colors hover:bg-accent/50"
    >
      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.posterPath ? (
          <FadeImage
            loader={tmdbPosterLoader}
            src={item.posterPath}
            alt={item.title}
            fill
            className="object-cover"
            fadeDuration={200}
            loading="lazy"
            sizes="64px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {item.type === "movie" ? (
              <Film className="h-5 w-5 text-muted-foreground/30" />
            ) : (
              <Tv className="h-5 w-5 text-muted-foreground/30" />
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {item.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{item.type === "movie" ? "Movie" : "TV Show"}</span>
          {item.year && (
            <>
              <span className="text-border">|</span>
              <span>{item.year}</span>
            </>
          )}
          {item.voteAverage != null && item.voteAverage > 0 && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-0.5 text-yellow-500">
                <Star className="h-3 w-3 fill-yellow-500" />
                {item.voteAverage.toFixed(1)}
              </span>
            </>
          )}
        </div>
        {item.overview && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {item.overview}
          </p>
        )}
      </div>

      {item.totalRating != null && item.voteCount != null && item.voteCount > 0 && (
        <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-2">
          <span className="text-lg font-bold text-primary">{item.totalRating}</span>
          <span className="text-[10px] text-muted-foreground">
            {item.voteCount} {item.voteCount === 1 ? "vote" : "votes"}
          </span>
        </div>
      )}
    </Link>
  );
}

export function MediaListItemSkeleton(): React.JSX.Element {
  return (
    <div className="flex gap-4 p-2">
      <Skeleton className="h-24 w-16 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full max-w-sm" />
      </div>
    </div>
  );
}

export function MediaListView({
  items,
  isLoading = false,
  skeletonCount = 8,
  className,
}: MediaListViewProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className={cn("flex flex-col divide-y divide-border/30", className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <MediaListItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <div />;
  }

  return (
    <div className={cn("flex flex-col divide-y divide-border/30", className)}>
      {items.map((item, i) => (
        <MediaListItem
          key={item.id ?? `${item.provider}-${item.externalId}-${i}`}
          item={item}
        />
      ))}
    </div>
  );
}
