"use client";

import { useCallback } from "react";
import { FadeImage } from "~/components/ui/fade-image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { Film, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbBackdropLoader } from "~/lib/tmdb-image";
import { mediaHref } from "~/lib/media-href";
import { MediaLogo } from "./media-logo";
import { useLogo } from "~/hooks/use-logos";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export type BadgeType = "trending" | "new" | "top-rated";

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
  className?: string;
}

const BADGE_CONFIG: Record<BadgeType, { label: string; className: string }> = {
  trending: { label: "TRENDING", className: "bg-amber-500 text-black" },
  new: { label: "NEW", className: "bg-emerald-500 text-white" },
  "top-rated": { label: "TOP RATED", className: "bg-blue-500 text-white" },
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
  className,
}: BackdropCardProps): React.JSX.Element {
  const href = mediaHref(provider ?? "tmdb", externalId ?? "0", type);
  const utils = trpc.useUtils();

  // If browse already provided logoPath, skip the per-card query
  const hasLogoFromProps = logoFromProps !== undefined;
  // getLogo is protected — unauthenticated users fall back to text title
  const fetchedLogo = useLogo(provider, externalId, type, {
    title,
    posterPath: null,
    backdropPath,
    year,
    voteAverage,
  }, { skip: hasLogoFromProps });

  const logoPath = hasLogoFromProps ? logoFromProps : fetchedLogo;

  // undefined = still loading, null = no logo, string = logo path
  const logoResolved = logoPath !== undefined;

  const handlePrefetch = useCallback(() => {
    if (externalId && type) {
      void utils.media.resolve.prefetch({
        provider: (provider ?? "tmdb") as "tmdb" | "tvdb",
        externalId: parseInt(externalId, 10),
        type,
      });
    }
  }, [externalId, provider, type, utils]);

  // Show skeleton until logo is resolved
  if (!logoResolved) {
    return <BackdropCardSkeleton className={className} />;
  }

  return (
    <Link
      href={href}
      onMouseEnter={handlePrefetch}
      className={cn(
        "group relative flex shrink-0 overflow-hidden rounded-xl animate-in fade-in-0 zoom-in-95 duration-500 ease-out fill-mode-both transition-all hover:z-10 hover:scale-[1.03] hover:ring-2 hover:ring-foreground/20",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {backdropPath ? (
          <FadeImage
            loader={tmdbBackdropLoader}
            src={backdropPath}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            fadeDuration={500}
            loading="lazy"
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 25vw"
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

        {/* Badge */}
        {badge && (
          <div className="absolute right-2.5 top-2.5 z-10">
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md",
                BADGE_CONFIG[badge].className,
              )}
            >
              {BADGE_CONFIG[badge].label}
            </span>
          </div>
        )}

        {/* Bottom gradient + logo or title */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-12">
          {logoPath ? (
            <MediaLogo src={`${TMDB_IMAGE_BASE}/w500${logoPath}`} alt={title} size="card" />
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-lg">
              {title}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <span>{type === "movie" ? "Movie" : "TV Show"}</span>
            {voteAverage != null && voteAverage > 0 && (
              <>
                <span className="text-white/30">·</span>
                <span className="text-yellow-500">
                  {voteAverage.toFixed(1)}
                </span>
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
