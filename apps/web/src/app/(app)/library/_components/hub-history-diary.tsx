"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, History, Star, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import { trpc } from "@/lib/trpc/client";
import { mediaHref } from "@/lib/media-href";
import { tmdbThumbLoader } from "@/lib/tmdb-image";
import { LibraryCarousel } from "./library-carousel";

const CARD_WIDTH_CLASS = "w-[220px] sm:w-[280px] lg:w-[340px] 2xl:w-[380px]";

type DiaryEntry = {
  id: string;
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  voteAverage: number | null;
  userRating: number | null;
  externalId: number;
  provider: string;
  watchedAt: Date;
  source: string | null;
  episode: {
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function relativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const sameDay = startOfDay(date).getTime() === startOfDay(now).getTime();
    if (sameDay) return `${hours}h ago`;
  }
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function episodeLabel(entry: DiaryEntry): string {
  if (!entry.episode) return entry.mediaType === "movie" ? "Movie" : "Episode";
  const s = String(entry.episode.seasonNumber ?? 0).padStart(2, "0");
  const e = String(entry.episode.number ?? 0).padStart(2, "0");
  const base = `S${s}E${e}`;
  return entry.episode.title ? `${base} · ${entry.episode.title}` : base;
}

function imagePath(entry: DiaryEntry): string | null {
  return entry.backdropPath ?? entry.posterPath;
}

function DiaryCard({
  entry,
  now,
}: {
  entry: DiaryEntry;
  now: Date;
}): React.JSX.Element {
  const cardImage = imagePath(entry);
  const [imageReady, setImageReady] = useState(!cardImage);

  if (!imageReady) {
    return (
      <div className={cn("relative shrink-0", CARD_WIDTH_CLASS)}>
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

  const time = relativeTime(entry.watchedAt, now);
  const href = mediaHref(entry.provider, entry.externalId, entry.mediaType);

  return (
    <Link
      href={href}
      className={cn(
        "group relative mt-1 flex shrink-0 overflow-hidden rounded-xl transition-[box-shadow] duration-200 hover:z-10 hover:ring-2 hover:ring-foreground/20",
        CARD_WIDTH_CLASS,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {cardImage ? (
          <Image
            loader={tmdbThumbLoader}
            src={cardImage}
            alt={entry.title}
            fill
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {entry.mediaType === "show" ? (
              <Tv className="h-10 w-10" />
            ) : (
              <Bookmark className="h-10 w-10" />
            )}
          </div>
        )}

        <div className="absolute right-1.5 top-1.5 rounded-md bg-black/85 px-1.5 py-[3px] text-[10px] font-bold uppercase leading-none tracking-wider text-white shadow-md ring-1 ring-white/10 backdrop-blur-md">
          {time}
        </div>

        {entry.userRating != null && entry.userRating > 0 && (
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/85 px-1.5 py-[3px] text-[11px] font-bold tabular-nums leading-none text-amber-400 shadow-md ring-1 ring-white/10 backdrop-blur-md">
            <Star className="h-2.5 w-2.5 fill-current" />
            {entry.userRating}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3.5 pb-3 pt-14">
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-lg">
            {entry.title}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="line-clamp-1 text-xs font-medium text-white/90">
              {episodeLabel(entry)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function HubHistoryDiary(): React.JSX.Element {
  const initialLimit = useResponsivePageSize({ mobile: 8, tablet: 12, desktop: 18 });
  const [limit] = useState(initialLimit);
  const { data, isLoading, isError, refetch } =
    trpc.userMedia.getLibraryHistory.useQuery({ limit });

  const now = useMemo(() => new Date(), []);

  const entries = useMemo<DiaryEntry[]>(() => {
    return (data?.items ?? []).map((raw) => {
      const r = raw as typeof raw & {
        backdropPath?: string | null;
        logoPath?: string | null;
        voteAverage?: number | null;
        userRating?: number | null;
      };
      return {
        id: r.id,
        mediaId: r.mediaId,
        mediaType: r.mediaType as "movie" | "show",
        title: r.title,
        posterPath: r.posterPath,
        backdropPath: r.backdropPath ?? null,
        logoPath: r.logoPath ?? null,
        year: r.year ?? null,
        voteAverage: r.voteAverage ?? null,
        userRating: r.userRating ?? null,
        externalId: r.externalId,
        provider: r.provider,
        watchedAt: new Date(r.watchedAt),
        source: ("source" in r ? r.source : null) as string | null,
        episode: r.episode ?? null,
      };
    });
  }, [data?.items]);

  return (
    <LibraryCarousel
      title="Recent Diary"
      icon={History}
      seeAllHref="/library/history"
      items={entries}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      emptyPreset="emptyContinueWatching"
      renderCard={(entry) => (
        <DiaryCard key={entry.id} entry={entry} now={now} />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-video"
    />
  );
}
