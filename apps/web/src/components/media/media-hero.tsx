"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { Star, Play, Plus, Info } from "lucide-react";
import { trpc } from "~/lib/trpc/client";

interface MediaHeroProps {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  overview?: string | null;
  backdropPath: string | null;
  posterPath?: string | null;
  year?: number | null;
  voteAverage?: number | null;
  genres?: string[];
  inLibrary?: boolean;
}

export function MediaHero({
  id,
  externalId,
  provider,
  type,
  title,
  overview,
  backdropPath,
  year,
  voteAverage,
  genres,
  inLibrary,
}: MediaHeroProps): React.JSX.Element {
  const addToLibrary = trpc.media.addToLibrary.useMutation();
  const utils = trpc.useUtils();

  const detailHref = id
    ? `/media/${id}`
    : `/media/ext?provider=${provider}&externalId=${externalId}&type=${type}`;

  const handleAddToLibrary = (): void => {
    if (!id) return;
    addToLibrary.mutate(
      { id },
      {
        onSuccess: () => {
          void utils.media.getById.invalidate({ id });
          void utils.library.list.invalidate();
        },
      },
    );
  };

  return (
    <section className="relative h-[70vh] min-h-[500px] w-full overflow-hidden">
      {/* Backdrop image */}
      {backdropPath && (
        <Image
          src={`https://image.tmdb.org/t/p/original${backdropPath}`}
          alt={title}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-screen-2xl">
          {/* Badges */}
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary" className="uppercase">
              {type === "movie" ? "Movie" : "TV Series"}
            </Badge>
            {voteAverage != null && voteAverage > 0 && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 border-yellow-500/50 text-yellow-500"
              >
                <Star className="h-3 w-3 fill-yellow-500" />
                {voteAverage.toFixed(1)}
              </Badge>
            )}
            {year && (
              <span className="text-sm text-zinc-400">{year}</span>
            )}
          </div>

          {/* Title */}
          <h1 className="mb-3 max-w-2xl text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          {/* Genres */}
          {genres && genres.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="text-sm font-light text-zinc-400"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {overview && (
            <p className="mb-6 line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              {overview}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link href={detailHref}>
              <Button size="lg" className="gap-2">
                <Info className="h-5 w-5" />
                View Details
              </Button>
            </Link>
            {id && !inLibrary && (
              <Button
                variant="secondary"
                size="lg"
                className="gap-2"
                onClick={handleAddToLibrary}
                disabled={addToLibrary.isPending}
              >
                <Plus className="h-5 w-5" />
                Add to Library
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MediaHeroSkeleton(): React.JSX.Element {
  return (
    <section className="relative h-[70vh] min-h-[500px] w-full overflow-hidden bg-muted">
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-screen-2xl">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
          <Skeleton className="mb-3 h-14 w-96 max-w-full" />
          <div className="mb-4 flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
          <Skeleton className="mb-6 h-16 w-full max-w-xl" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-36" />
            <Skeleton className="h-11 w-40" />
          </div>
        </div>
      </div>
    </section>
  );
}
