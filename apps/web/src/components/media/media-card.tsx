"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { Star, Film, Tv, Check } from "lucide-react";

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
  inLibrary?: boolean;
  showTypeBadge?: boolean;
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
  inLibrary,
  showTypeBadge = true,
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
        "group relative flex flex-col rounded-xl transition-transform duration-300 ease-out hover:z-10 hover:scale-110",
        className,
      )}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted">
        {posterPath ? (
          <Image
            src={posterPath.startsWith("http") ? posterPath : `https://image.tmdb.org/t/p/w500${posterPath}`}
            alt={title}
            fill
            className="object-cover transition-opacity duration-300"
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

        {/* Rating badge — top left */}
        {voteAverage != null && voteAverage > 0 && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
            <span className="text-[11px] font-semibold text-white">
              {voteAverage.toFixed(1)}
            </span>
          </div>
        )}

        {/* In library badge — top right */}
        {inLibrary && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-primary px-1.5 py-0.5">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}

        {/* Type badge — top right (only if not in library) */}
        {showTypeBadge && !inLibrary && (
          <div className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/80 backdrop-blur-sm">
            {type === "movie" ? "Movie" : "TV"}
          </div>
        )}
      </div>

      {/* Title + year below poster */}
      <div className="mt-2 px-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
          {title}
        </p>
        {year && (
          <p className="mt-1 text-sm text-muted-foreground/60">{year}</p>
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
    <div className={cn("flex flex-col", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <div className="mt-2 space-y-1.5 px-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
