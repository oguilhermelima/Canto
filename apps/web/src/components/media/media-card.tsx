"use client";

import { useCallback, useState } from "react";
import { FadeImage } from "~/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { EyeOff, Film, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbPosterLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";

interface MediaCardProps {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
  overview?: string | null;
  showTypeBadge?: boolean;
  showRating?: boolean;
  showYear?: boolean;
  showTitle?: boolean;
  progress?: { percent: number; value: number; total: number; unit: "seconds" | "episodes" } | null;
  onHide?: () => void;
  href?: string;
  className?: string;
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
  showTitle = true,
  progress,
  onHide,
  href,
  className,
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
        externalId: parseInt(eid, 10),
        type: type as "movie" | "show",
      });
    }
  }, [id, externalId, provider, type, utils]);

  if (!imageReady) {
    return (
      <div className={cn("relative", className)}>
        <MediaCardSkeleton showTitle={showTitle} />
        {/* Render image offscreen to trigger preload */}
        <FadeImage
          loader={tmdbPosterLoader}
          src={posterPath!}
          alt=""
          fill
          className="pointer-events-none !absolute !h-0 !w-0 opacity-0"
          onLoad={() => setImageReady(true)}
          loading="lazy"
          sizes="1px"
        />
      </div>
    );
  }

  return (
    <Link
      href={linkHref}
      onMouseEnter={handlePrefetch}
      className={cn(
        "group relative flex flex-col rounded-xl animate-in fade-in-0 zoom-in-95 duration-500 ease-out fill-mode-both transition-all hover:z-10 hover:scale-105",
        className,
      )}
    >
      {/* Poster */}
      <div className="poster-frame relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted transition-shadow duration-300">
        {posterPath ? (
          <FadeImage
            loader={tmdbPosterLoader}
            src={posterPath}
            alt={title}
            fill
            className="object-cover"
            fadeDuration={300}
            loading="lazy"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground/20" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground/20" />
            )}
          </div>
        )}

        {/* Hover overlay with gradient + info */}
        <div className="absolute inset-0 flex flex-col justify-end opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-16">
            <p className="line-clamp-4 text-sm font-semibold leading-tight text-white">
              {title}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/70">
              <span>{type === "movie" ? "Movie" : "TV Show"}</span>
              {voteAverage != null && voteAverage > 0 && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="text-yellow-400">{voteAverage.toFixed(1)}</span>
                </>
              )}
              {year && (
                <>
                  <span className="text-white/30">·</span>
                  <span>{year}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Hide button */}
        {onHide && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onHide();
            }}
            className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/70 opacity-0 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white group-hover:opacity-100"
            aria-label={`Hide ${title}`}
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Progress bar */}
        {progress && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
            <div
              className="h-full bg-white"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        )}
      </div>

      {/* Title below poster */}
      {showTitle && (
        <div className="mt-2 px-0.5">
          <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
            {title}
          </p>
        </div>
      )}
    </Link>
  );
}

export function MediaCardSkeleton({
  className,
  showTitle = true,
}: {
  className?: string;
  showTitle?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn("flex flex-col", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      {showTitle && (
        <div className="mt-2 space-y-1.5 px-0.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-12" />
        </div>
      )}
    </div>
  );
}
