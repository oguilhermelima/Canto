"use client";

import { useCallback, useState } from "react";
import { FadeImage } from "@/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { Film, Star, Tv } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { tmdbPosterLoader } from "@/lib/tmdb-image";
import { mediaHref } from "@/lib/media-href";

function formatRating(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

function CardRating({
  value,
  starClassName,
  title,
  count,
}: {
  value: number;
  starClassName: string;
  title: string;
  count?: number | null;
}): React.JSX.Element {
  return (
    <span
      title={
        count != null && count > 0
          ? `${title} (${count} vote${count === 1 ? "" : "s"})`
          : title
      }
      className="inline-flex items-center gap-1"
    >
      <Star size={12} className={cn("fill-current", starClassName)} />
      <span className="tabular-nums">{formatRating(value)}</span>
    </span>
  );
}

export interface MediaCardSlots {
  /** Overlay rendered at top-left of the poster (e.g., rating badges). */
  topLeft?: React.ReactNode;
  /** Overlay rendered at top-right of the poster (e.g., episode tag, user rating). */
  topRight?: React.ReactNode;
  /** Replaces the default meta line under the title (type · year · rating). */
  subtitle?: React.ReactNode;
  /** Appended after subtitle/meta with a separator. */
  extra?: React.ReactNode;
}

interface MediaCardProps {
  id?: string;
  externalId?: string | number;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
  userRating?: number | null;
  membersAvg?: number | null;
  membersCount?: number | null;
  progress?: {
    percent: number;
    value?: number;
    total?: number;
    unit?: "seconds" | "episodes";
  } | null;
  href?: string;
  className?: string;
  slots?: MediaCardSlots;
}

export function MediaCard({
  id,
  externalId,
  provider,
  type,
  title,
  posterPath,
  year,
  voteAverage,
  userRating,
  membersAvg,
  membersCount,
  progress,
  href,
  className,
  slots,
}: MediaCardProps): React.JSX.Element {
  const linkHref =
    href ?? mediaHref(provider ?? "tmdb", externalId ?? id ?? "0", type);
  const utils = trpc.useUtils();
  const [imageReady, setImageReady] = useState(!posterPath);

  const handlePrefetch = useCallback(() => {
    const eid = externalId ?? id;
    if (eid) {
      void utils.media.resolve.prefetch({
        provider: (provider ?? "tmdb") as "tmdb" | "tvdb",
        externalId: typeof eid === "number" ? eid : parseInt(eid, 10),
        type,
      });
    }
  }, [id, externalId, provider, type, utils]);

  const typeLabel = type === "movie" ? "MOVIE" : "TV SHOW";
  const subtitle = slots?.subtitle;
  const extra = slots?.extra;
  const hasPublicRating = voteAverage != null && voteAverage > 0;
  const hasUserRating = userRating != null && userRating > 0;
  const hasMembersRating = membersAvg != null && membersAvg > 0;
  const hasAnyRating = hasPublicRating || hasUserRating || hasMembersRating;

  return (
    <Link
      href={linkHref}
      onMouseEnter={handlePrefetch}
      className={cn("group mt-1 flex flex-col", className)}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-[box-shadow] duration-200 group-hover:ring-2 group-hover:ring-foreground/20">
        {posterPath ? (
          <FadeImage
            loader={tmdbPosterLoader}
            src={posterPath}
            alt={title}
            fill
            className="object-cover"
            fadeDuration={200}
            loading="lazy"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
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

        {slots?.topLeft && (
          <div className="absolute left-1.5 top-1.5 z-10">{slots.topLeft}</div>
        )}
        {slots?.topRight && (
          <div className="absolute right-1.5 top-1.5 z-10">{slots.topRight}</div>
        )}

        {progress && progress.percent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
            <div
              className="h-full bg-white"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-col gap-1 px-0.5 md:mt-2 md:gap-1.5">
        {title && title.trim().length > 0 && (
          <p className="line-clamp-2 text-xs font-semibold text-foreground transition-colors group-hover:text-primary md:text-sm">
            {title}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-medium tracking-wide text-muted-foreground md:text-xs">
          {subtitle ? (
            <span className="line-clamp-1">{subtitle}</span>
          ) : (
            <>
              <span>{typeLabel}</span>
              {year && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{year}</span>
                </>
              )}
            </>
          )}
          {extra && (
            <>
              <span aria-hidden>·</span>
              <span className="line-clamp-1">{extra}</span>
            </>
          )}
        </div>
        {hasAnyRating && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-medium tracking-wide text-muted-foreground md:text-xs">
            {hasPublicRating && (
              <CardRating
                value={voteAverage}
                starClassName="text-yellow-400"
                title="Public rating (TMDB)"
              />
            )}
            {hasPublicRating && (hasUserRating || hasMembersRating) && (
              <span aria-hidden>·</span>
            )}
            {hasUserRating && (
              <CardRating
                value={userRating}
                starClassName="text-emerald-400"
                title="Your rating"
              />
            )}
            {hasUserRating && hasMembersRating && (
              <span aria-hidden>·</span>
            )}
            {hasMembersRating && (
              <CardRating
                value={membersAvg}
                starClassName="text-cyan-300"
                title="Members rating"
                count={membersCount}
              />
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function MediaCardSkeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("mt-1 flex flex-col", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <div className="mt-1.5 flex flex-col gap-1 px-0.5 md:mt-2 md:gap-1.5">
        <Skeleton className="h-3 w-3/4 rounded md:h-3.5" />
        <Skeleton className="h-2.5 w-1/2 rounded md:h-3" />
        <Skeleton className="h-2.5 w-2/5 rounded md:h-3" />
      </div>
    </div>
  );
}
