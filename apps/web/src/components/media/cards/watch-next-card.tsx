"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Tv } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import { mediaHref } from "@/lib/media-href";
import { tmdbThumbLoader } from "@/lib/tmdb-image";

export type WatchNextView = "continue" | "watch_next";

export interface WatchNextItem {
  id: string;
  kind: "continue" | "next_episode" | "next_movie" | "because_watched";
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
  becauseOf?: {
    mediaId: string;
    title: string;
    posterPath: string | null;
  } | null;
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

function buildSubtitle(item: WatchNextItem): string {
  if (item.kind === "continue") {
    if (item.episode) {
      const ep = `S${String(item.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode.number ?? 0).padStart(2, "0")}`;
      return item.episode.title ? `${ep} · ${item.episode.title}` : ep;
    }
    return sourceLabel(item.source);
  }

  if (item.kind === "next_episode") {
    const ep = `S${String(item.episode?.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode?.number ?? 0).padStart(2, "0")}`;
    return item.episode?.title ? `${ep} · ${item.episode.title}` : ep;
  }

  if (item.kind === "because_watched" && item.becauseOf) {
    return `Because you watched ${item.becauseOf.title}`;
  }

  return item.mediaType === "show" ? "TV SHOW" : "MOVIE";
}

function buildExtra(item: WatchNextItem): string | null {
  if (
    item.progressUnit === "seconds" &&
    item.progressTotal !== null &&
    item.progressValue !== null
  ) {
    return `${formatProgress(item.progressValue)} / ${formatProgress(item.progressTotal)}`;
  }
  if (
    item.progressUnit === "episodes" &&
    item.progressTotal !== null &&
    item.progressValue !== null
  ) {
    return `${item.progressValue}/${item.progressTotal} ep`;
  }
  return null;
}

const CARD_WIDTH = "w-[220px] shrink-0 sm:w-[280px] lg:w-[340px] 2xl:w-[380px]";

export function WatchNextCard({
  item,
  view,
}: {
  item: WatchNextItem;
  view: WatchNextView;
}): React.JSX.Element {
  const cardImage = imagePath(item);
  const [imageReady, setImageReady] = useState(!cardImage);
  const subtitle = buildSubtitle(item);
  const extra = buildExtra(item);

  if (!imageReady) {
    return (
      <div className={cn("mt-1 flex flex-col", CARD_WIDTH)}>
        <Skeleton className="aspect-video w-full rounded-xl" />
        {cardImage && (
          <img
            src={tmdbThumbLoader({ src: cardImage, width: 780, quality: 75 })}
            alt=""
            onLoad={() => setImageReady(true)}
            className="invisible absolute h-0 w-0"
          />
        )}
        <div className="mt-1.5 flex flex-col gap-1 px-0.5 md:mt-2 md:gap-1.5">
          <Skeleton className="h-3 w-3/4 rounded md:h-3.5" />
          <Skeleton className="h-2.5 w-1/2 rounded md:h-3" />
        </div>
      </div>
    );
  }

  return (
    <Link
      href={mediaHref(item.provider, item.externalId, item.mediaType)}
      className={cn("group mt-1 flex flex-col", CARD_WIDTH)}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted transition-[box-shadow] duration-200 group-hover:ring-2 group-hover:ring-foreground/20">
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

        {item.progressPercent !== null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-4 pt-14">
            <div className="flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.min(item.progressPercent, 100)}%` }}
                />
              </div>
              {extra && (
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-white/90">
                  {extra}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-col gap-1 px-0.5 md:mt-2 md:gap-1.5">
        <p className="line-clamp-2 text-xs font-semibold text-foreground transition-colors group-hover:text-primary md:text-sm">
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-medium tracking-wide text-muted-foreground md:text-xs">
          <span className="line-clamp-1">{subtitle}</span>
        </div>
      </div>
    </Link>
  );
}
