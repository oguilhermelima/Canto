"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
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
      className={cn("group block", className)}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-neutral-100 transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-lg">
        {posterPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w500${posterPath}`}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {type === "movie" ? (
              <Film className="h-10 w-10 text-neutral-300" />
            ) : (
              <Tv className="h-10 w-10 text-neutral-300" />
            )}
          </div>
        )}

        {/* Type badge — top right */}
        <div
          className={cn(
            "absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
            type === "movie" ? "bg-red-500" : "bg-green-600",
          )}
        >
          {type === "movie" ? "MOVIE" : "TV"}
        </div>
      </div>

      {/* Title below poster */}
      <p className="mt-2 line-clamp-1 text-sm font-medium text-black">
        {title}
      </p>
      {year && (
        <p className="text-xs text-neutral-500">{year}</p>
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
    <div className={cn("space-y-2", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
