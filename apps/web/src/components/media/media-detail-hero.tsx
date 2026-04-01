"use client";

import Image from "next/image";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Clock,
  Film,
  Tv,
} from "lucide-react";
import { AddToListButton } from "~/components/media/add-to-list-button";
import { MediaBadges } from "~/components/media/media-badges";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

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
  voteCount?: number | null;
  genres?: string[];
  runtime?: number | null;
  status?: string | null;
  logoPath?: string | null;
  externalId?: number | null;
  provider?: string | null;
  trailerUrl?: string | null;
  watchProviders?: Array<{
    providerId: number;
    providerName: string;
    logoPath: string | null;
  }>;
  rentBuyProviders?: Array<{
    providerId: number;
    providerName: string;
    logoPath: string | null;
  }>;
  availableSources?: Array<{
    type: "jellyfin" | "plex";
    resolution?: string | null;
  }>;
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
  voteAverage,
  voteCount,
  genres,
  runtime,
  status,
  logoPath,
  provider,
  availableSources,
}: MediaDetailHeroProps): React.JSX.Element {
  const resolveImage = (path: string, size: string): string =>
    path.startsWith("http") ? path : `${TMDB_IMAGE_BASE}/${size}${path}`;

  const logoUrl = logoPath ? resolveImage(logoPath, "w500") : null;

  const formatRuntime = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <>
      {/* Hero Backdrop — extends behind topbar */}
      <div className="hero-backdrop relative -mt-16 min-h-[420px] w-full">
        {backdropPath ? (
          <div className="absolute inset-0 overflow-hidden">
            <Image
              src={resolveImage(backdropPath, "original")}
              alt=""
              fill
              className="object-cover object-top"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background from-5% via-background/50 via-35% to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/25 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-background" />
        )}

        <div className="relative mx-auto flex min-h-[600px] w-full flex-col justify-end px-4 pb-10 pt-28 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <div className="flex max-w-5xl flex-col gap-8 md:flex-row md:items-end">
            {/* Poster */}
            <div className="relative aspect-[2/3] w-[220px] shrink-0 self-center overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 md:w-[330px] md:self-auto lg:w-[380px]">
              {posterPath ? (
                <Image
                  src={resolveImage(posterPath, "w500")}
                  alt={title}
                  fill
                  className="object-cover"
                  sizes="380px"
                  priority
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/50">
                  {type === "movie" ? (
                    <Film className="h-12 w-12 text-muted-foreground/40" />
                  ) : (
                    <Tv className="h-12 w-12 text-muted-foreground/40" />
                  )}
                </div>
              )}
              {/* Badges on poster */}
              <div className="absolute left-2 top-2 flex items-center gap-1.5">
                {status && (
                  <Badge
                    variant="secondary"
                    className="border-none bg-black/60 text-[10px] text-white backdrop-blur-sm"
                  >
                    {status}
                  </Badge>
                )}
                {provider && (
                  <Badge
                    variant="outline"
                    className="border-none bg-black/60 text-[10px] uppercase text-white backdrop-blur-sm"
                  >
                    {provider}
                  </Badge>
                )}
              </div>
              {/* Availability badges */}
              {availableSources && availableSources.length > 0 && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                  {availableSources.map((src) => (
                    <Badge
                      key={src.type}
                      className={
                        src.type === "jellyfin"
                          ? "border-none bg-[#00a4dc] text-[10px] text-white"
                          : "border-none bg-[#e5a00d] text-[10px] text-black"
                      }
                    >
                      {src.resolution ? `${src.resolution} · ` : ""}{src.type === "jellyfin" ? "Jellyfin" : "Plex"}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-4 pb-1">
              {tagline && (
                <p className="text-sm italic text-foreground/60">{tagline}</p>
              )}

              {/* Logo or Title */}
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={title}
                  className="h-auto max-h-24 w-auto max-w-sm object-contain object-left md:max-h-36 md:max-w-md lg:max-h-44 lg:max-w-lg"
                  style={{
                    filter:
                      "drop-shadow(0 2px 8px rgba(0,0,0,0.5)) drop-shadow(0 0 20px rgba(0,0,0,0.3))",
                  }}
                />
              ) : (
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground drop-shadow-sm lg:text-4xl xl:text-5xl">
                  {title}
                </h1>
              )}

              {/* Meta badges */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <MediaBadges
                  type={type as "movie" | "show"}
                  year={year}
                  voteAverage={voteAverage}
                  size="md"
                />
                {runtime != null && runtime > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80 backdrop-blur-sm">
                    <Clock className="h-3 w-3" />
                    {formatRuntime(runtime)}
                  </span>
                )}
              </div>

              {/* Genres */}
              {genres && genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((genre) => (
                    <Badge key={genre} variant="secondary" className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Buttons */}
              <div className="mt-2 flex flex-wrap gap-2.5">
                <AddToListButton
                  mediaId={id}
                  title={title}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overview — below hero */}
      {overview && (
        <div className="px-4 pt-1 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <p className="max-w-4xl text-sm leading-relaxed text-foreground/70">
            {overview}
          </p>
        </div>
      )}
    </>
  );
}

export function MediaDetailHeroSkeleton(): React.JSX.Element {
  return (
    <div className="relative -mt-16 min-h-[420px] w-full">
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-background" />
      <div className="relative mx-auto flex min-h-[600px] w-full flex-col justify-end px-4 pb-10 pt-28 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex max-w-5xl flex-col gap-8 md:flex-row md:items-end">
          <Skeleton className="aspect-[2/3] w-[220px] shrink-0 self-center rounded-xl md:w-[330px] md:self-auto lg:w-[380px]" />
          <div className="flex flex-1 flex-col gap-4 pb-1">
            <Skeleton className="h-10 w-96 max-w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex gap-2.5">
              <Skeleton className="h-9 w-32 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
