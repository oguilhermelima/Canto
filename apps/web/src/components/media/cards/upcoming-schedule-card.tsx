"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Tv } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import { mediaHref } from "~/lib/media-href";
import { useLogo } from "~/hooks/use-logos";
import { MediaLogo } from "~/components/media/media-logo";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export interface UpcomingScheduleItem {
  id: string;
  kind: "upcoming_episode" | "upcoming_movie";
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  fromLists: string[];
  releaseAt: Date | string;
  episode:
    | {
        id: string;
        seasonNumber: number;
        number: number;
        title: string | null;
      }
    | null;
}

function imageUrl(item: UpcomingScheduleItem): string | null {
  const path = item.backdropPath ?? item.posterPath;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/w780${path}`;
}

function formatReleaseLabel(value: Date): string {
  if (Number.isNaN(value.getTime())) return "Soon";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfRelease = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  const diffDays = Math.round(
    (startOfRelease.getTime() - startOfToday.getTime()) / 86_400_000,
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

export function UpcomingScheduleCard({
  item,
}: {
  item: UpcomingScheduleItem;
}): React.JSX.Element {
  const releaseDate = new Date(item.releaseAt);
  const releaseLabel = formatReleaseLabel(releaseDate);
  const episodeLabel = item.episode
    ? `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}${item.episode.title ? ` · ${item.episode.title}` : ""}`
    : "Movie release";

  const cardImage = imageUrl(item);
  const logoPath = useLogo(
    item.provider,
    String(item.externalId),
    item.mediaType,
    {
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      year: item.year,
    },
  );
  const [imageReady, setImageReady] = useState(!cardImage);
  const logoResolved = logoPath !== undefined;

  if (!logoResolved || !imageReady) {
    return (
      <div className="relative w-[280px] shrink-0 sm:w-[300px] lg:w-[340px] 2xl:w-[380px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        {cardImage && !imageReady && (
          <img
            src={cardImage}
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
            src={cardImage}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            {item.mediaType === "show" ? (
              <Tv className="h-10 w-10" />
            ) : (
              <Bookmark className="h-10 w-10" />
            )}
          </div>
        )}

        <div className="absolute right-2.5 top-2.5 rounded-sm bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          {releaseLabel}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-14">
          {logoPath ? (
            <MediaLogo
              src={`${TMDB_IMAGE_BASE}/w500${logoPath}`}
              alt={item.title}
              size="card"
              className="max-w-[70%]"
            />
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
              {item.title}
            </p>
          )}
          <p
            className={cn(
              "line-clamp-2 text-xs text-white/80",
              logoPath ? "mt-2" : "mt-1",
            )}
          >
            {episodeLabel}
          </p>
          <p className="mt-1 text-[11px] text-white/70">
            {releaseDate.toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}
