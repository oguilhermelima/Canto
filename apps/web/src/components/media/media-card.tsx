"use client";

import { useCallback, useState } from "react";
import { FadeImage } from "@/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { Film, Tv } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { tmdbPosterLoader } from "@/lib/tmdb-image";
import { mediaHref } from "@/lib/media-href";
import { RatingInline } from "./rating-badge";

export interface MediaCardSlots {
  /** Overlay rendered at top-left of the poster (e.g., rating badges). */
  topLeft?: React.ReactNode;
  /** Overlay rendered at top-right of the poster (e.g., episode tag, user rating). */
  topRight?: React.ReactNode;
  /** Optional line shown above the title in the hover overlay. */
  hoverSubtitle?: React.ReactNode;
  /** Optional line shown below the type/year meta in the hover overlay. */
  hoverExtra?: React.ReactNode;
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
  progress?: {
    percent: number;
    value?: number;
    total?: number;
    unit?: "seconds" | "episodes";
  } | null;
  href?: string;
  className?: string;
  slots?: MediaCardSlots;
  /** Suppress the inline rating in the hover overlay meta row (when caller shows its own rating badge). */
  hideMetaRating?: boolean;
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
  progress,
  href,
  className,
  slots,
  hideMetaRating = false,
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

  return (
    <Link
      href={linkHref}
      onMouseEnter={handlePrefetch}
      className={cn(
        "group relative mt-1 flex rounded-xl transition-[box-shadow] duration-200 hover:z-10 hover:ring-2 hover:ring-foreground/20",
        className,
      )}
    >
      <div className="poster-frame relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted">
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

        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-end opacity-0 transition-opacity duration-300 group-hover:opacity-100",
            !imageReady && "pointer-events-none",
          )}
        >
          <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pb-3 pt-20">
            {slots?.hoverSubtitle && (
              <div className="mb-1 line-clamp-1 text-xs font-medium text-white/75">
                {slots.hoverSubtitle}
              </div>
            )}
            {title && title.trim().length > 0 && (
              <p className="line-clamp-3 text-base font-semibold leading-tight text-white">
                {title}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-white/80">
              <span>{type === "movie" ? "Movie" : "TV Show"}</span>
              {!hideMetaRating && voteAverage != null && voteAverage > 0 && (
                <>
                  <span className="opacity-40" aria-hidden>•</span>
                  <RatingInline variant="public" value={voteAverage} />
                </>
              )}
              {year && (
                <>
                  <span className="opacity-40" aria-hidden>•</span>
                  <span className="tabular-nums">{year}</span>
                </>
              )}
            </div>
            {slots?.hoverExtra && (
              <div className="mt-1 line-clamp-1 text-xs text-white/70">
                {slots.hoverExtra}
              </div>
            )}
          </div>
        </div>

        {progress && progress.percent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
            <div
              className="h-full bg-white"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
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
    <Skeleton className={cn("mt-1 aspect-[2/3] w-full rounded-xl", className)} />
  );
}
