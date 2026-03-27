"use client";

import Image from "next/image";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Star,
  Plus,
  Check,
  Clock,
  Calendar,
  Film,
  Tv,
  Download,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";

interface MediaDetailHeroProps {
  id: string;
  type: "movie" | "show";
  title: string;
  tagline?: string | null;
  overview?: string | null;
  backdropPath: string | null;
  posterPath: string | null;
  year?: number | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  genres?: string[];
  runtime?: number | null;
  status?: string | null;
  inLibrary?: boolean;
  onDownloadClick?: () => void;
}

export function MediaDetailHero({
  id,
  type,
  title,
  tagline,
  overview,
  backdropPath,
  posterPath,
  year,
  releaseDate,
  voteAverage,
  genres,
  runtime,
  status,
  inLibrary = false,
  onDownloadClick,
}: MediaDetailHeroProps): React.JSX.Element {
  const addToLibrary = trpc.media.addToLibrary.useMutation();
  const removeFromLibrary = trpc.media.removeFromLibrary.useMutation();
  const utils = trpc.useUtils();

  const handleLibraryToggle = (): void => {
    const mutation = inLibrary ? removeFromLibrary : addToLibrary;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void utils.media.getById.invalidate({ id });
          void utils.library.list.invalidate();
          void utils.library.stats.invalidate();
        },
      },
    );
  };

  const formatRuntime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const isPending = addToLibrary.isPending || removeFromLibrary.isPending;

  return (
    <section className="relative min-h-[60vh] w-full overflow-hidden">
      {/* Backdrop */}
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
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />

      {/* Content */}
      <div className="relative px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-8 md:flex-row md:items-end">
          {/* Poster */}
          <div className="relative mx-auto h-[300px] w-[200px] shrink-0 overflow-hidden rounded-xl shadow-2xl md:mx-0 md:h-[360px] md:w-[240px]">
            {posterPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w500${posterPath}`}
                alt={title}
                fill
                className="object-cover"
                sizes="240px"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                {type === "movie" ? (
                  <Film className="h-16 w-16 text-muted-foreground" />
                ) : (
                  <Tv className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            {/* Title */}
            <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              {title}
            </h1>

            {/* Tagline */}
            {tagline && (
              <p className="mb-4 text-base italic text-zinc-400">{tagline}</p>
            )}

            {/* Meta info row */}
            <div className="mb-4 flex flex-wrap items-center justify-center gap-3 md:justify-start">
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

              {status && type === "show" && (
                <Badge
                  variant={
                    status === "Returning Series" ? "default" : "secondary"
                  }
                >
                  {status}
                </Badge>
              )}

              {releaseDate && (
                <span className="flex items-center gap-1 text-sm text-zinc-400">
                  <Calendar className="h-3.5 w-3.5" />
                  {releaseDate}
                </span>
              )}

              {runtime != null && runtime > 0 && (
                <span className="flex items-center gap-1 text-sm text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  {formatRuntime(runtime)}
                </span>
              )}
            </div>

            {/* Genres */}
            {genres && genres.length > 0 && (
              <div className="mb-4 flex flex-wrap justify-center gap-2 md:justify-start">
                {genres.map((genre) => (
                  <Badge key={genre} variant="outline" className="font-normal">
                    {genre}
                  </Badge>
                ))}
              </div>
            )}

            {/* Overview */}
            {overview && (
              <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
                {overview}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Button
                variant={inLibrary ? "secondary" : "default"}
                size="lg"
                className="gap-2"
                onClick={handleLibraryToggle}
                disabled={isPending}
              >
                {inLibrary ? (
                  <>
                    <Check className="h-5 w-5" />
                    In Library
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    Add to Library
                  </>
                )}
              </Button>

              {onDownloadClick && (
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  onClick={onDownloadClick}
                >
                  <Download className="h-5 w-5" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MediaDetailHeroSkeleton(): React.JSX.Element {
  return (
    <section className="relative min-h-[60vh] w-full overflow-hidden bg-muted/30">
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      <div className="relative px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-8 md:flex-row md:items-end">
          <Skeleton className="mx-auto h-[300px] w-[200px] rounded-xl md:mx-0 md:h-[360px] md:w-[240px]" />
          <div className="flex-1 space-y-4">
            <Skeleton className="mx-auto h-12 w-80 md:mx-0" />
            <Skeleton className="mx-auto h-5 w-48 md:mx-0" />
            <div className="flex justify-center gap-2 md:justify-start">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="flex justify-center gap-2 md:justify-start">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-14" />
            </div>
            <Skeleton className="mx-auto h-20 w-full max-w-2xl md:mx-0" />
            <div className="flex justify-center gap-3 md:justify-start">
              <Skeleton className="h-11 w-40" />
              <Skeleton className="h-11 w-36" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
