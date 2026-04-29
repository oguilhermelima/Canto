"use client";

import { useCallback, useState } from "react";
import { FadeImage } from "@/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { EyeOff, Film, Star, Tv } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { tmdbThumbLoader } from "@/lib/tmdb-image";
import { mediaHref } from "@/lib/media-href";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatRating(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

export type BadgeType = "trending" | "new" | "top-rated" | "continue";

interface BackdropCardProps {
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  backdropPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
  userRating?: number | null;
  badge?: BadgeType | null;
  progress?: { percent: number; value: number; total: number; unit: "seconds" | "episodes" } | null;
  onHide?: () => void;
  className?: string;
}

const BADGE_CONFIG: Record<BadgeType, { label: string; className: string }> = {
  continue: { label: "CONTINUE", className: "bg-white/95 text-black ring-black/10" },
  trending: { label: "TRENDING", className: "bg-black/85 text-amber-300 ring-white/10" },
  new: { label: "NEW", className: "bg-black/85 text-emerald-300 ring-white/10" },
  "top-rated": { label: "TOP RATED", className: "bg-black/85 text-sky-300 ring-white/10" },
};

export function BackdropCard({
  externalId,
  provider,
  type,
  title,
  backdropPath,
  year,
  voteAverage,
  userRating,
  badge,
  progress,
  onHide,
  className,
}: BackdropCardProps): React.JSX.Element {
  const href = mediaHref(provider ?? "tmdb", externalId ?? "0", type);
  const utils = trpc.useUtils();
  const [imageReady, setImageReady] = useState(!backdropPath);

  const handlePrefetch = useCallback(() => {
    if (externalId) {
      void utils.media.resolve.prefetch({
        provider: (provider ?? "tmdb") as "tmdb" | "tvdb",
        externalId: parseInt(externalId, 10),
        type,
      });
    }
  }, [externalId, provider, type, utils]);

  const typeLabel = type === "movie" ? "MOVIE" : "TV SHOW";
  const hasPublicRating = voteAverage != null && voteAverage > 0;
  const hasUserRating = userRating != null && userRating > 0;
  const hasAnyRating = hasPublicRating || hasUserRating;

  return (
    <Link
      href={href}
      onMouseEnter={handlePrefetch}
      className={cn("group mt-1 flex shrink-0 flex-col", className)}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted transition-[box-shadow] duration-200 group-hover:ring-2 group-hover:ring-foreground/20">
        {backdropPath ? (
          <FadeImage
            loader={tmdbThumbLoader}
            src={backdropPath}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            fadeDuration={250}
            loading="lazy"
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
            onLoad={() => setImageReady(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        )}

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            imageReady ? "opacity-0" : "opacity-100",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-xl bg-muted",
              !imageReady && "animate-pulse",
            )}
          />
        </div>

        {onHide && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onHide();
            }}
            className="absolute left-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/70 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 hover:text-white group-hover:opacity-100"
            aria-label={`Hide ${title}`}
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        )}

        {badge && (
          <div className="absolute right-1.5 top-1.5 z-10">
            <span
              className={cn(
                "rounded-md px-1.5 py-[3px] text-[10px] font-bold leading-none uppercase tracking-wider shadow-md ring-1 backdrop-blur-md",
                BADGE_CONFIG[badge].className,
              )}
            >
              {BADGE_CONFIG[badge].label}
            </span>
          </div>
        )}

        {progress && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-4 pt-14">
            <div className="flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.min(progress.percent, 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-white/90">
                {progress.unit === "seconds"
                  ? `${formatDuration(progress.value)} / ${formatDuration(progress.total)}`
                  : `${progress.value}/${progress.total} ep`}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5 px-0.5">
        <p className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
          {title}
        </p>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium tracking-wide text-muted-foreground">
          <span>{typeLabel}</span>
          {year && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{year}</span>
            </>
          )}
        </div>
        {hasAnyRating && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium tracking-wide text-muted-foreground">
            {hasPublicRating && (
              <span
                title="Public rating (TMDB)"
                className="inline-flex items-center gap-1"
              >
                <Star size={12} className="fill-current text-yellow-400" />
                <span className="tabular-nums">{formatRating(voteAverage!)}</span>
              </span>
            )}
            {hasPublicRating && hasUserRating && <span aria-hidden>·</span>}
            {hasUserRating && (
              <span
                title="Your rating"
                className="inline-flex items-center gap-1"
              >
                <Star size={12} className="fill-current text-emerald-400" />
                <span className="tabular-nums">{formatRating(userRating!)}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function BackdropCardSkeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("mt-1 flex flex-col", className)}>
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="mt-2 flex flex-col gap-1.5 px-0.5">
        <Skeleton className="h-3.5 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
        <Skeleton className="h-3 w-2/5 rounded" />
      </div>
    </div>
  );
}
