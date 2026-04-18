"use client";

import { useCallback, useState } from "react";
import { FadeImage } from "~/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { EyeOff, Film, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbThumbLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";
import { MediaLogo } from "./media-logo";
import { RatingInline } from "./rating-badge";
import { useLogo } from "~/hooks/use-logos";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export type BadgeType = "trending" | "new" | "top-rated" | "continue";

interface BackdropCardProps {
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  backdropPath: string | null;
  logoPath?: string | null;
  year?: number | null;
  voteAverage?: number | null;
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
  // logoPath from props (via enriched browse):
  //   undefined = not provided (cold start → fetch per-card)
  //   null = no logo exists on TMDB
  //   string = logo file path
  logoPath: logoFromProps,
  year,
  voteAverage,
  badge,
  progress,
  onHide,
  className,
}: BackdropCardProps): React.JSX.Element {
  const href = mediaHref(provider ?? "tmdb", externalId ?? "0", type);
  const utils = trpc.useUtils();

  const hasLogoFromProps = logoFromProps !== undefined;
  const fetchedLogo = useLogo(provider, externalId, type, {
    title,
    posterPath: null,
    backdropPath,
    year,
    voteAverage,
  }, { skip: hasLogoFromProps });

  const logoPath = hasLogoFromProps ? logoFromProps : fetchedLogo;
  const logoResolved = logoPath !== undefined;
  const [imageReady, setImageReady] = useState(!backdropPath);
  const ready = imageReady && logoResolved;

  const handlePrefetch = useCallback(() => {
    if (externalId) {
      void utils.media.resolve.prefetch({
        provider: (provider ?? "tmdb") as "tmdb" | "tvdb",
        externalId: parseInt(externalId, 10),
        type,
      });
    }
  }, [externalId, provider, type, utils]);

  return (
    <Link
      href={href}
      onMouseEnter={handlePrefetch}
      className={cn(
        "group relative flex shrink-0 overflow-hidden rounded-xl transition-[box-shadow] duration-200 hover:z-10 hover:ring-2 hover:ring-foreground/20",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
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

        {/* Skeleton shimmer on top until image + logo resolved */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            ready ? "opacity-0" : "opacity-100",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-xl bg-muted",
              !ready && "animate-pulse",
            )}
          />
        </div>

        {/* Overlays fade in once content ready */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-200",
            ready ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
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

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-12">
            {logoPath ? (
              <MediaLogo src={`${TMDB_IMAGE_BASE}/w500${logoPath}`} alt={title} size="card" />
            ) : (
              <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-lg">
                {title}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-white/85">
              <span>{type === "movie" ? "Movie" : "TV Show"}</span>
              {voteAverage != null && voteAverage > 0 && (
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
            {progress && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-white">
                  {progress.unit === "seconds"
                    ? `${formatDuration(progress.value)} / ${formatDuration(progress.total)}`
                    : `${progress.value}/${progress.total}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BackdropCardSkeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={cn("aspect-video rounded-xl", className)} />;
}
