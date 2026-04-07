"use client";

import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { Film, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbPosterLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";

interface MediaCardProps {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
  overview?: string | null;
  showTypeBadge?: boolean;
  showRating?: boolean;
  showYear?: boolean;
  showTitle?: boolean;
  href?: string;
  className?: string;
}

export function MediaCard({
  id,
  externalId,
  provider,
  type,
  title,
  posterPath,
  year,
  voteAverage,
  showTitle = true,
  href,
  className,
}: MediaCardProps): React.JSX.Element {
  const linkHref =
    href ??
    (id
      ? `/media/${id}`
      : mediaHref(provider ?? "tmdb", externalId ?? "0", type));

  const utils = trpc.useUtils();

  const handlePrefetch = useCallback(() => {
    if (id) {
      void utils.media.getById.prefetch({ id });
      void utils.media.getExtras.prefetch({ id });
    } else if (externalId && provider && type) {
      void utils.media.getByExternal.prefetch({
        provider: provider as "tmdb" | "tvdb",
        externalId: parseInt(externalId, 10),
        type: type as "movie" | "show",
      });
    }
  }, [id, externalId, provider, type, utils]);

  return (
    <Link
      href={linkHref}
      onMouseEnter={handlePrefetch}
      className={cn(
        "group relative flex flex-col rounded-xl transition-all duration-300 ease-out hover:z-10 hover:scale-105",
        className,
      )}
    >
      {/* Poster */}
      <div className="poster-frame relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-shadow duration-300">
        {posterPath ? (
          <Image
            loader={tmdbPosterLoader}
            src={posterPath}
            alt={title}
            fill
            className="object-cover"
            loading="lazy"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground/20" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground/20" />
            )}
          </div>
        )}

        {/* Hover overlay with gradient + info */}
        <div className="absolute inset-0 flex flex-col justify-end opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-16">
            <p className="line-clamp-4 text-sm font-semibold leading-tight text-white">
              {title}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/60">
              <span>{type === "movie" ? "Movie" : "TV Show"}</span>
              {voteAverage != null && voteAverage > 0 && (
                <>
                  <span className="text-white/30">|</span>
                  <span className="text-yellow-500">{voteAverage.toFixed(1)}</span>
                </>
              )}
              {year && (
                <>
                  <span className="text-white/30">|</span>
                  <span>{year}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Title below poster */}
      {showTitle && (
        <div className="mt-2 px-0.5">
          <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
            {title}
          </p>
        </div>
      )}
    </Link>
  );
}

export function MediaCardSkeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("flex flex-col", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <div className="mt-2 space-y-1.5 px-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
