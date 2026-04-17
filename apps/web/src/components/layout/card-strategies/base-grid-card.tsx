"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Film, Star, Tv } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { FadeImage } from "~/components/ui/fade-image";
import { tmdbPosterLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";
import { trpc } from "~/lib/trpc/client";
import type { BrowseItem } from "~/components/layout/browse-layout.types";

/**
 * Standard grid card used by all BrowseLayout strategies.
 *
 * Renders: poster → optional badge → optional progress bar → title → subtitle → extra line
 */
export function BaseGridCard({
  item,
  badge,
  subtitle,
  extra,
}: {
  item: BrowseItem;
  badge?: React.ReactNode;
  subtitle?: string | null;
  extra?: string | null;
}): React.JSX.Element {
  const linkHref = mediaHref(item.provider, item.externalId, item.type);
  const percent = item.progress?.percent ?? 0;

  const utils = trpc.useUtils();
  const handlePrefetch = useCallback(() => {
    const eid = item.externalId;
    if (eid) {
      void utils.media.resolve.prefetch({
        provider: item.provider as "tmdb" | "tvdb",
        externalId: typeof eid === "number" ? eid : parseInt(String(eid), 10),
        type: item.type,
      });
    }
  }, [item.externalId, item.provider, item.type, utils]);

  return (
    <Link
      href={linkHref}
      onMouseEnter={handlePrefetch}
      className="group relative flex flex-col rounded-xl transition-all duration-300 ease-out hover:z-10 hover:scale-105"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-shadow duration-300">
        {item.posterPath ? (
          <FadeImage
            loader={tmdbPosterLoader}
            src={item.posterPath}
            alt={item.title}
            fill
            className="object-cover"
            fadeDuration={300}
            loading="lazy"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {item.type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Badge (top-left) */}
        {badge}

        {/* Progress bar (bottom of poster) */}
        {percent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div
              className="h-full bg-white"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Info below poster */}
      <div className="mt-2 px-0.5">
        <p className="line-clamp-1 text-sm font-medium leading-tight text-foreground">
          {item.title}
        </p>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{item.type === "movie" ? "Movie" : "TV Show"}</span>
          {item.voteAverage != null && item.voteAverage > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-yellow-500">
                <Star className="h-3 w-3 fill-yellow-500" />
                {item.voteAverage.toFixed(1)}
              </span>
            </>
          )}
          {item.year && (
            <>
              <span>·</span>
              <span>{item.year}</span>
            </>
          )}
        </div>
        {extra && (
          <p className="mt-0.5 text-xs text-muted-foreground">{extra}</p>
        )}
      </div>
    </Link>
  );
}

export function BaseGridCardSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <div className="mt-2 space-y-1 px-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
