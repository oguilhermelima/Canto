"use client";

import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@canto/ui/skeleton";
import { Star, Info } from "lucide-react";
import { AddToListButton } from "~/components/media/add-to-list-button";

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
}: MediaHeroProps): React.JSX.Element {
  const detailHref = id
    ? `/media/${id}`
    : `/media/ext?provider=${provider}&externalId=${externalId}&type=${type}`;

  return (
    <section className="relative h-[80vh] min-h-[500px] w-full overflow-hidden">
      {/* Backdrop image */}
      {backdropPath && (
        <Image
          src={backdropPath.startsWith("http") ? backdropPath : `https://image.tmdb.org/t/p/original${backdropPath}`}
          alt={title}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
      )}

      {/* Gradient overlay — bottom fades to background */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-screen-2xl">
          {/* Title */}
          <h1 className="mb-4 max-w-2xl text-4xl font-bold text-white sm:text-5xl">
            {title}
          </h1>

          {/* Meta row: rating, year, type */}
          <div className="mb-4 flex items-center gap-3">
            {voteAverage != null && voteAverage > 0 && (
              <span className="flex items-center gap-1 text-sm text-white">
                <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                {voteAverage.toFixed(1)}
              </span>
            )}
            {year && (
              <span className="text-sm text-white/70">{year}</span>
            )}
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium uppercase text-white">
              {type === "movie" ? "Movie" : "TV Series"}
            </span>
          </div>

          {/* Genre pills */}
          {genres && genres.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-white/40 px-3 py-1 text-sm text-white"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {overview && (
            <p className="mb-6 line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/80">
              {overview}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              href={detailHref}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Info className="h-4 w-4" />
              More Info
            </Link>
            {id && (
              <AddToListButton
                mediaId={id}
                variant="dark"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MediaHeroSkeleton(): React.JSX.Element {
  return (
    <section className="relative h-[80vh] min-h-[500px] w-full overflow-hidden bg-muted">
      <div className="absolute inset-0 bg-gradient-to-t from-background via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-screen-2xl">
          <Skeleton className="mb-4 h-12 w-96 max-w-full bg-white/20" />
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-5 w-14 bg-white/20" />
            <Skeleton className="h-5 w-12 bg-white/20" />
            <Skeleton className="h-5 w-20 bg-white/20" />
          </div>
          <div className="mb-4 flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full bg-white/20" />
            <Skeleton className="h-8 w-24 rounded-full bg-white/20" />
            <Skeleton className="h-8 w-16 rounded-full bg-white/20" />
          </div>
          <Skeleton className="mb-6 h-16 w-full max-w-2xl bg-white/20" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-32 rounded-full bg-white/20" />
            <Skeleton className="h-10 w-10 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </section>
  );
}
