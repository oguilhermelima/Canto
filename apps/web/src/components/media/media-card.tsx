"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { Star, Film, Tv } from "lucide-react";

interface MediaCardProps {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
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
  href,
  className,
}: MediaCardProps): React.JSX.Element {
  const linkHref =
    href ??
    (id
      ? `/media/${id}`
      : `/media/ext?provider=${provider}&externalId=${externalId}&type=${type}`);

  return (
    <Link
      href={linkHref}
      className={cn(
        "group relative block overflow-hidden rounded-lg transition-transform duration-200 hover:scale-105",
        className,
      )}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted">
        {posterPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w500${posterPath}`}
            alt={title}
            fill
            className="object-cover transition-opacity duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Type badge */}
        <Badge
          variant="secondary"
          className="absolute left-2 top-2 text-[10px] uppercase opacity-0 transition-opacity group-hover:opacity-100"
        >
          {type === "movie" ? "Movie" : "TV"}
        </Badge>

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-2 text-sm font-semibold text-white">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-2">
            {year && (
              <span className="text-xs text-zinc-300">{year}</span>
            )}
            {voteAverage != null && voteAverage > 0 && (
              <span className="flex items-center gap-1 text-xs text-zinc-300">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                {voteAverage.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Title below (visible always on mobile) */}
      <div className="mt-2 md:hidden">
        <p className="line-clamp-1 text-sm font-medium text-foreground">
          {title}
        </p>
        {year && (
          <p className="text-xs text-muted-foreground">{year}</p>
        )}
      </div>
    </Link>
  );
}

export function MediaCardSkeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4 md:hidden" />
      <Skeleton className="h-3 w-1/2 md:hidden" />
    </div>
  );
}
