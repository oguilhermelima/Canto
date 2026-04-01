"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { Film, Tv, Check } from "lucide-react";
import { MediaBadges } from "./media-badges";

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
  inLibrary,
  showTypeBadge = true,
  showRating = true,
  showYear = true,
  showTitle = true,
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
        "group relative flex flex-col rounded-xl transition-all duration-300 ease-out hover:z-10 hover:scale-105 [&:hover_.poster-frame]:ring-2 [&:hover_.poster-frame]:ring-white/60",
        className,
      )}
    >
      {/* Poster */}
      <div className="poster-frame relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-shadow duration-300">
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

        {/* In library badge — top right */}
        {inLibrary && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-primary px-1.5 py-0.5">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}

        {/* Badges — hidden by default, visible on hover */}
        <div className="absolute left-2 top-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <MediaBadges
            voteAverage={voteAverage}
            year={showYear ? year : undefined}
            size="sm"
          />
        </div>
        {showTypeBadge && (
          <div className="absolute right-2 top-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <MediaBadges type={type} size="sm" />
          </div>
        )}
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
