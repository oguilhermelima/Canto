"use client";

import Link from "next/link";
import { SpotlightActions } from "@/components/home/spotlight-actions";
import { MediaLogo } from "@/components/media/media-logo";
import { RatingInline } from "@/components/media/rating-badge";
import { mediaHref } from "@/lib/media-href";
import type { SpotlightItem } from "./spotlight-hero";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface SpotlightContentProps {
  item: SpotlightItem;
  slideDirection: 1 | -1;
  onPausedChange: (paused: boolean) => void;
  onPrefetch: (item: SpotlightItem) => void;
  actionsTrailing?: React.ReactNode;
}

export function SpotlightContent({
  item,
  slideDirection,
  onPausedChange,
  onPrefetch,
  actionsTrailing,
}: SpotlightContentProps): React.JSX.Element {
  const previewUrl = mediaHref(item.provider, item.externalId, item.type);

  return (
    <div
      className="flex max-w-2xl flex-col gap-3 animate-[contentSlideIn_0.35s_cubic-bezier(0.16,1,0.3,1)_both] md:gap-5"
      style={{ "--slide-from": `${slideDirection * 24}px` } as React.CSSProperties}
    >
      <Link
        href={previewUrl}
        onMouseEnter={() => onPrefetch(item)}
        className="flex flex-col gap-3 md:gap-5"
      >
        {item.logoPath ? (
          <MediaLogo
            src={`${TMDB_IMAGE_BASE}/original${item.logoPath}`}
            alt={item.title}
            size="spotlight"
            className="max-w-[60vw]"
          />
        ) : (
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground drop-shadow-lg sm:text-3xl md:text-4xl xl:text-5xl">
            {item.title}
          </h1>
        )}
      </Link>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
        <span>{item.type === "movie" ? "Movie" : "TV Show"}</span>
        {item.voteAverage !== undefined && item.voteAverage > 0 && (
          <>
            <span className="opacity-40" aria-hidden>•</span>
            <RatingInline variant="public" value={item.voteAverage} />
          </>
        )}
        {item.year && (
          <>
            <span className="opacity-40" aria-hidden>•</span>
            <span className="tabular-nums">{item.year}</span>
          </>
        )}
        {item.genres.length > 0 && (
          <>
            <span className="opacity-40" aria-hidden>•</span>
            {item.genres.map((genre, i) => {
              const genreId = item.genreIds[i];
              return (
                <span key={genre} className="flex items-center gap-x-2">
                  {i > 0 && <span className="opacity-40" aria-hidden>·</span>}
                  <Link
                    href={`/search${genreId ? `?genre=${genreId}` : ""}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {genre}
                  </Link>
                </span>
              );
            })}
          </>
        )}
      </div>
      {item.overview && (
        <Link href={previewUrl} onMouseEnter={() => onPrefetch(item)}>
          <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:line-clamp-3 md:text-base">
            {item.overview}
          </p>
        </Link>
      )}

      <div className="flex items-center gap-2 pt-1">
        <SpotlightActions
          externalId={item.externalId}
          provider={item.provider}
          type={item.type}
          title={item.title}
          onOpenChange={onPausedChange}
        />
        {actionsTrailing && <div className="ml-auto">{actionsTrailing}</div>}
      </div>
    </div>
  );
}
