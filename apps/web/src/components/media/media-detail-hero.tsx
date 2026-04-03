"use client";

import Image from "next/image";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { AddToListButton } from "~/components/media/add-to-list-button";
import { MediaLogo } from "~/components/media/media-logo";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface WatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

interface CrewMember {
  personId: number;
  name: string;
  job: string;
}

interface VideoItem {
  key: string;
  name?: string;
  type?: string;
}

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
  genreIds?: number[];
  runtime?: number | null;
  contentRating?: string | null;
  status?: string | null;
  logoPath?: string | null;
  externalId?: number | null;
  provider?: string | null;
  availableSources?: Array<{
    type: "jellyfin" | "plex";
    resolution?: string | null;
  }>;
  isAdmin?: boolean;
  /** Content rendered at the bottom of the hero, still over the backdrop */
  children?: React.ReactNode;
  // Where to watch
  servers?: { jellyfin?: { url: string }; plex?: { url: string } } | null;
  flatrateProviders?: WatchProvider[];
  rentBuyProviders?: WatchProvider[];
  watchLink?: string;
  watchProviderLinks?: Record<number, string>;
  // Trailers
  videos?: VideoItem[];
  // Crew
  crew?: CrewMember[];
}

export function MediaDetailHero({
  id,
  type,
  title,
  overview,
  backdropPath,
  year,
  releaseDate,
  voteAverage,
  genres,
  genreIds,
  runtime,
  contentRating,
  logoPath,
  isAdmin,
  children,
  servers,
  flatrateProviders,
  rentBuyProviders,
  watchLink,
  watchProviderLinks,
  videos,
  crew,
}: MediaDetailHeroProps): React.JSX.Element {
  const resolveImage = (path: string, size: string): string =>
    path.startsWith("http") ? path : `${TMDB_IMAGE_BASE}/${size}${path}`;

  const formatRuntime = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatDate = (date: string): string => {
    try {
      return new Date(date).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return date;
    }
  };

  const logoUrl = logoPath ? resolveImage(logoPath, "w780") : null;

  // Director/Creator
  const director = (crew ?? []).find(
    (c) => c.job === "Director" || c.job === "Creator",
  );

  // Trailers (top 4)
  const trailers = (videos ?? []).slice(0, 4);

  // Watch providers
  const hasServers = servers?.jellyfin || servers?.plex;
  const allProviders = [...(flatrateProviders ?? []), ...(rentBuyProviders ?? [])];
  const hasProviders = allProviders.length > 0;

  const getProviderUrl = (providerId: number): string | undefined => {
    const template = watchProviderLinks?.[providerId];
    if (template) return template.replace("{title}", encodeURIComponent(title));
    return watchLink;
  };

  return (
    <div className="hero-backdrop relative -mt-16 w-full overflow-x-hidden">
      {/* Backdrop image — exactly 100dvh tall, scrolls with content */}
      {backdropPath ? (
        <div className="absolute inset-x-0 top-0 h-dvh overflow-hidden">
          <Image
            src={resolveImage(backdropPath, "original")}
            alt=""
            fill
            className="object-cover object-top"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background from-0% via-background/50 via-50% to-background/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
        </div>
      ) : (
        <div className="absolute inset-x-0 top-0 h-dvh bg-gradient-to-b from-muted/30 to-background" />
      )}

      {/* Info section */}
      <div className="relative mx-auto w-full px-4 pb-6 pt-[30dvh] md:pt-[25dvh] md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="max-w-3xl space-y-4">
          {/* Logo or Title */}
          {logoUrl ? (
            <MediaLogo src={logoUrl} alt={title} size="hero" className="max-w-[60vw]" />
          ) : (
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground drop-shadow-lg sm:text-3xl md:text-4xl xl:text-5xl">
              {title}
            </h1>
          )}

          {/* Director/Creator */}
          {director && (
            <p className="text-xs text-foreground/60 sm:text-sm">
              {director.job === "Director" ? "Directed by" : "Created by"}{" "}
              <Link
                href={`/person/${director.personId}`}
                className="font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                {director.name}
              </Link>
            </p>
          )}

          {/* Meta line */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-foreground/60 sm:gap-x-3 sm:text-sm">
            <span>{type === "movie" ? "Movie" : "TV Show"}</span>
            {voteAverage != null && voteAverage > 0 && (
              <>
                <span className="text-foreground/20">|</span>
                <span className="text-yellow-500">{voteAverage.toFixed(1)}</span>
              </>
            )}
            {releaseDate && (
              <>
                <span className="text-foreground/20">|</span>
                <span>{formatDate(releaseDate)}</span>
              </>
            )}
            {contentRating && (
              <>
                <span className="text-foreground/20">|</span>
                <span className="rounded border border-foreground/20 px-1.5 py-0.5 text-xs font-medium leading-none">
                  {contentRating}
                </span>
              </>
            )}
            {runtime != null && runtime > 0 && (
              <>
                <span className="text-foreground/20">|</span>
                <span>{formatRuntime(runtime)}</span>
              </>
            )}
            {genres && genres.length > 0 && (
              <>
                <span className="text-foreground/20">|</span>
                {genres.map((genre, i) => {
                  const gId = genreIds?.[i];
                  return (
                    <span key={genre} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-foreground/20">,</span>}
                      <Link
                        href={`/search${gId ? `?genre=${gId}` : ""}`}
                        className="transition-colors hover:text-foreground"
                      >
                        {genre}
                      </Link>
                    </span>
                  );
                })}
              </>
            )}
          </div>

          {/* Overview */}
          {overview && (
            <div className="max-w-2xl">
              <p className="text-xs leading-relaxed text-foreground/70 sm:text-sm">
                {overview}
              </p>
            </div>
          )}

          {/* Where to Watch row */}
          {(hasServers || hasProviders) && (
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
              <span className="shrink-0 text-xs font-medium capitalize text-foreground/40">
                Where to watch
              </span>
              {/* Jellyfin */}
              {servers?.jellyfin && (
                <a
                  href={servers.jellyfin.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#a95ce0]/25 bg-[#a95ce0]/10 px-3.5 text-sm font-medium transition-colors hover:bg-[#a95ce0]/20"
                >
                  <span
                    className="inline-block h-4 w-4 shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, #a95ce0, #4bb8e8)",
                      mask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                      WebkitMask:
                        "url(/jellyfin-logo.svg) center/contain no-repeat",
                    }}
                  />
                  <span className="bg-gradient-to-r from-[#a95ce0] to-[#4bb8e8] bg-clip-text text-transparent">
                    Jellyfin
                  </span>
                </a>
              )}

              {/* Plex */}
              {servers?.plex && (
                <a
                  href={servers.plex.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#e5a00d]/25 bg-[#e5a00d]/10 px-3.5 text-sm font-medium text-[#e5a00d] transition-colors hover:bg-[#e5a00d]/20"
                >
                  <span
                    className="inline-block h-4 w-4 shrink-0 bg-[#e5a00d]"
                    style={{
                      mask: "url(/plex-logo.svg) center/contain no-repeat",
                      WebkitMask:
                        "url(/plex-logo.svg) center/contain no-repeat",
                    }}
                  />
                  Plex
                </a>
              )}

              {/* Top streaming (first 2 flatrate) */}
              {(flatrateProviders ?? []).slice(0, 2).map((p) => (
                <a
                  key={p.providerId}
                  href={getProviderUrl(p.providerId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white/10 px-3 backdrop-blur-sm transition-colors hover:bg-white/15"
                >
                  {p.logoPath && (
                    <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded">
                      <Image
                        src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="20px"
                      />
                    </div>
                  )}
                  <span className="text-sm text-foreground/80">
                    {p.providerName}
                  </span>
                </a>
              ))}

              {/* All providers popover */}
              {allProviders.length > 0 && (
                <MoreProvidersPopover
                  flatrate={flatrateProviders ?? []}
                  rentBuy={rentBuyProviders ?? []}
                  getUrl={getProviderUrl}
                />
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <AddToListButton mediaId={id} title={title} size="lg" />
          </div>

        </div>
      </div>

      {/* Children (e.g. videos) — still inside the hero backdrop */}
      {children && (
        <div className="relative pt-6 md:pt-8">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── More Providers Popover ─── */

function MoreProvidersPopover({
  flatrate,
  rentBuy,
  getUrl,
}: {
  flatrate: WatchProvider[];
  rentBuy: WatchProvider[];
  getUrl: (id: number) => string | undefined;
}): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm text-foreground/70 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-foreground">
          All
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-h-[400px] overflow-y-auto p-0"
      >
        {flatrate.length > 0 && (
          <div className="p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stream
            </p>
            <div className="space-y-1">
              {flatrate.map((p) => (
                <ProviderRow key={p.providerId} provider={p} url={getUrl(p.providerId)} />
              ))}
            </div>
          </div>
        )}
        {rentBuy.length > 0 && (
          <div className={cn("p-3", flatrate.length > 0 && "border-t border-border")}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rent / Buy
            </p>
            <div className="space-y-1">
              {rentBuy.map((p) => (
                <ProviderRow key={p.providerId} provider={p} url={getUrl(p.providerId)} />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ProviderRow({
  provider: p,
  url,
}: {
  provider: WatchProvider;
  url: string | undefined;
}): React.JSX.Element {
  const content = (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent">
      {p.logoPath ? (
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
          <Image
            src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`}
            alt=""
            fill
            className="object-cover"
            sizes="32px"
          />
        </div>
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">
          {p.providerName.slice(0, 2)}
        </div>
      )}
      <span className="text-sm">{p.providerName}</span>
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

export function MediaDetailHeroSkeleton(): React.JSX.Element {
  return (
    <div className="relative -mt-16 w-full">
      <div className="absolute inset-x-0 top-0 h-dvh bg-gradient-to-b from-muted/30 to-background" />
      <div className="relative mx-auto w-full px-4 pb-6 pt-[30dvh] md:pt-[25dvh] md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="max-w-3xl space-y-4">
          <Skeleton className="h-12 w-80 max-w-full md:h-16" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-14 w-full max-w-2xl" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-28 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-20 rounded-xl" />
          </div>
          <div className="flex gap-2.5">
            <Skeleton className="h-10 w-32 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>
      </div>
      {/* Video skeletons */}
      <div className="relative pt-6 md:pt-8">
        <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          <Skeleton className="h-7 w-20" />
        </div>
        <div className="flex gap-4 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          <Skeleton className="aspect-video w-[300px] shrink-0 rounded-xl sm:w-[340px] lg:w-[380px]" />
          <Skeleton className="aspect-video w-[300px] shrink-0 rounded-xl sm:w-[340px] lg:w-[380px]" />
          <Skeleton className="aspect-video w-[300px] shrink-0 rounded-xl sm:w-[340px] lg:w-[380px]" />
        </div>
      </div>
      {/* Section skeletons */}
      <div className="flex flex-col gap-12 px-4 pt-12 md:gap-16 md:px-8 md:pt-16 lg:px-12 xl:px-16 2xl:px-24">
        <section>
          <Skeleton className="mb-4 h-7 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
