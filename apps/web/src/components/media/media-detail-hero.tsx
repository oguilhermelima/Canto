"use client";

import Image from "next/image";
import { Button } from "@canto/ui/button";
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
  Play,
  Settings,
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
    <section className="relative w-full">
      {/* Backdrop image area */}
      <div className="relative h-[400px] w-full overflow-hidden">
        {backdropPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/original${backdropPath}`}
            alt={title}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        ) : (
          <div className="h-full w-full bg-neutral-100" />
        )}

        {/* Bottom gradient fading to white */}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
      </div>

      {/* Content area overlapping the backdrop */}
      <div className="relative mx-auto -mt-32 max-w-screen-2xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
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
              <div className="flex h-full w-full items-center justify-center bg-neutral-100">
                {type === "movie" ? (
                  <Film className="h-16 w-16 text-neutral-300" />
                ) : (
                  <Tv className="h-16 w-16 text-neutral-300" />
                )}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pt-4 text-center md:text-left">
            {/* Title */}
            <h1 className="mb-2 text-3xl font-bold text-black sm:text-4xl lg:text-5xl">
              {title}
            </h1>

            {/* Tagline */}
            {tagline && (
              <p className="mb-3 text-base italic text-neutral-500">{tagline}</p>
            )}

            {/* Meta info row */}
            <div className="mb-4 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              {year && (
                <span className="text-sm font-medium text-neutral-600">
                  {year}
                </span>
              )}

              {voteAverage != null && voteAverage > 0 && (
                <span className="flex items-center gap-1 text-sm font-medium text-neutral-600">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  {voteAverage.toFixed(1)}
                </span>
              )}

              {runtime != null && runtime > 0 && (
                <span className="flex items-center gap-1 text-sm text-neutral-500">
                  <Clock className="h-3.5 w-3.5" />
                  {formatRuntime(runtime)}
                </span>
              )}

              {status && type === "show" && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                  {status}
                </span>
              )}

              {releaseDate && (
                <span className="flex items-center gap-1 text-sm text-neutral-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {releaseDate}
                </span>
              )}
            </div>

            {/* Genres */}
            {genres && genres.length > 0 && (
              <div className="mb-5 flex flex-wrap justify-center gap-2 md:justify-start">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-700"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            {overview && (
              <p className="mb-6 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-base">
                {overview}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Button
                size="lg"
                className={
                  inLibrary
                    ? "gap-2 rounded-lg border border-neutral-200 bg-white text-black hover:bg-neutral-50"
                    : "gap-2 rounded-lg bg-black text-white hover:bg-neutral-800"
                }
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
                  className="gap-2 rounded-lg border-neutral-300 text-black hover:bg-neutral-50"
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
    <section className="relative w-full">
      {/* Backdrop skeleton */}
      <div className="relative h-[400px] w-full overflow-hidden bg-neutral-100">
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
      </div>

      {/* Content skeleton */}
      <div className="relative mx-auto -mt-32 max-w-screen-2xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <Skeleton className="mx-auto h-[300px] w-[200px] rounded-xl md:mx-0 md:h-[360px] md:w-[240px]" />
          <div className="flex-1 space-y-4 pt-4">
            <Skeleton className="mx-auto h-12 w-80 md:mx-0" />
            <Skeleton className="mx-auto h-5 w-48 md:mx-0" />
            <div className="flex justify-center gap-2 md:justify-start">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="flex justify-center gap-2 md:justify-start">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
            <Skeleton className="mx-auto h-20 w-full max-w-2xl md:mx-0" />
            <div className="flex justify-center gap-3 md:justify-start">
              <Skeleton className="h-11 w-40 rounded-lg" />
              <Skeleton className="h-11 w-36 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
