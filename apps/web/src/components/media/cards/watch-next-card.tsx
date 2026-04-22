"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Tv } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import { mediaHref } from "@/lib/media-href";
import { useLogo } from "@/hooks/use-logos";
import { MediaLogo } from "@/components/media/media-logo";
import { tmdbThumbLoader } from "@/lib/tmdb-image";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export type WatchNextView = "continue" | "watch_next";

export interface WatchNextItem {
  id: string;
  kind: "continue" | "next_episode" | "next_movie";
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  source: string;
  progressSeconds: number;
  durationSeconds: number | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "seconds" | "episodes" | null;
  watchedAt: Date | null;
  episode:
    | {
        id: string;
        seasonNumber: number | null;
        number: number | null;
        title: string | null;
      }
    | null;
  fromLists: string[];
}

function sourceLabel(source: string): string {
  if (source === "jellyfin") return "Jellyfin";
  if (source === "plex") return "Plex";
  return "Library";
}

function formatProgress(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function imagePath(item: WatchNextItem): string | null {
  return item.backdropPath ?? item.posterPath;
}

function itemLabel(item: WatchNextItem): string {
  if (item.kind === "continue") {
    return item.episode
      ? `S${String(item.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode.number ?? 0).padStart(2, "0")} · ${sourceLabel(item.source)}`
      : `Movie · ${sourceLabel(item.source)}`;
  }

  if (item.kind === "next_episode") {
    return `S${String(item.episode?.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode?.number ?? 0).padStart(2, "0")}${item.episode?.title ? ` · ${item.episode.title}` : ""}`;
  }

  return "Movie to start";
}

export function WatchNextCard({
  item,
  view,
}: {
  item: WatchNextItem;
  view: WatchNextView;
}): React.JSX.Element {
  const progressText =
    item.progressUnit === "seconds" &&
    item.progressTotal !== null &&
    item.progressValue !== null
      ? `${formatProgress(item.progressValue)} / ${formatProgress(item.progressTotal)}`
      : item.progressUnit === "episodes" &&
          item.progressTotal !== null &&
          item.progressValue !== null
        ? `${item.progressValue}/${item.progressTotal} episodes watched`
        : null;

  const cardImage = imagePath(item);
  // Prefer the logo coming from the procedure (already localized via the
  // mediaI18n JOIN). Fall back to the on-demand `useLogo` only when the source
  // didn't supply one — e.g. items that haven't been enriched yet.
  const fetchedLogo = useLogo(
    item.provider,
    String(item.externalId),
    item.mediaType,
    {
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      year: item.year,
    },
    { skip: !!item.logoPath },
  );
  const logoPath = item.logoPath ?? fetchedLogo;
  const [imageReady, setImageReady] = useState(!cardImage);
  const logoResolved = !!item.logoPath || fetchedLogo !== undefined;

  if (!logoResolved || !imageReady) {
    return (
      <div className="relative w-[280px] shrink-0 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        {cardImage && !imageReady && (
          <img
            src={tmdbThumbLoader({ src: cardImage, width: 780, quality: 75 })}
            alt=""
            onLoad={() => setImageReady(true)}
            className="invisible absolute h-0 w-0"
          />
        )}
      </div>
    );
  }

  return (
    <Link
      href={mediaHref(item.provider, item.externalId, item.mediaType)}
      className="group relative flex w-[280px] shrink-0 overflow-hidden rounded-xl transition-[box-shadow] duration-200 hover:z-10 hover:ring-2 hover:ring-foreground/20 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {cardImage ? (
          <Image
            loader={tmdbThumbLoader}
            src={cardImage}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {item.mediaType === "show" ? (
              <Tv className="h-10 w-10" />
            ) : (
              <Bookmark className="h-10 w-10" />
            )}
          </div>
        )}

        <div className={cn(
          "absolute right-1.5 top-1.5 rounded-md px-1.5 py-[3px] text-[10px] font-bold leading-none uppercase tracking-wider shadow-md backdrop-blur-md ring-1",
          view === "continue"
            ? "bg-white/95 text-black ring-black/10"
            : "bg-black/85 text-sky-300 ring-white/10",
        )}>
          {view === "continue" ? "CONTINUE" : "UP NEXT"}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3.5 pb-3 pt-14">
          {logoPath ? (
            <MediaLogo
              src={`${TMDB_IMAGE_BASE}/w500${logoPath}`}
              alt={item.title}
              size="card"
              className="max-w-[70%]"
            />
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-lg">
              {item.title}
            </p>
          )}
          <div className={cn("flex items-center gap-1.5", logoPath ? "mt-2" : "mt-1.5")}>
            <span className="text-xs font-medium text-white/90">{itemLabel(item)}</span>
          </div>
          {item.progressPercent !== null && (
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white/80"
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-white/70">
                {progressText ?? `${item.progressPercent}%`}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
