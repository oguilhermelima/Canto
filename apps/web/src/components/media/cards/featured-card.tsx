"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { EyeOff, Film, Tv, Volume2, VolumeOff } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { FadeImage } from "@/components/ui/fade-image";
import { AddToListButton } from "@/components/media/add-to-list-button";
import { MediaLogo } from "@/components/media/media-logo";
import { RatingInline } from "@/components/media/rating-badge";
import { tmdbBackdropLoader, tmdbPosterLoader } from "@/lib/tmdb-image";
import { mediaHref } from "@/lib/media-href";
import type { FeaturedItem } from "@/components/media/featured-carousel";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const TRAILER_DELAY_MS = 800;

export function FeaturedCard({
  item,
  index,
  isOpen,
  onHover,
  onHide,
}: {
  item: FeaturedItem;
  index: number;
  isOpen: boolean;
  onHover: () => void;
  onHide: () => void;
}): React.JSX.Element {
  const [showTrailer, setShowTrailer] = useState(false);
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const trailerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    onHover();
    if (item.trailerKey) {
      trailerTimerRef.current = setTimeout(() => setShowTrailer(true), TRAILER_DELAY_MS);
    }
  }, [onHover, item.trailerKey]);

  const handleMouseLeave = useCallback(() => {
    if (trailerTimerRef.current) clearTimeout(trailerTimerRef.current);
    trailerTimerRef.current = null;
    setShowTrailer(false);
    setMuted(true);
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: next ? "mute" : "unMute", args: [] }),
      "*",
    );
  }, [muted]);

  const href = mediaHref(item.provider, item.externalId, item.type);
  const posterSrc = item.posterPath ?? null;
  const backdropSrc = item.backdropPath ?? null;

  return (
    <div
      className={cn(
        "group relative mt-1 shrink-0 overflow-hidden rounded-xl transition-[width] duration-200 ease-out",
        "h-[300px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px]",
        isOpen
          ? "border border-border w-[calc(300px*16/9)] sm:w-[calc(400px*16/9)] lg:w-[calc(440px*16/9)] 2xl:w-[calc(500px*16/9)]"
          : "w-[180px] sm:w-[250px] lg:w-[280px] 2xl:w-[320px]",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Poster — visible when closed */}
      <Link
        href={href}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          isOpen ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {posterSrc ? (
          <FadeImage
            loader={tmdbPosterLoader}
            src={posterSrc}
            alt={item.title}
            fill
            className="object-cover"
            fadeDuration={250}
            priority={index < 2}
            sizes="(max-width: 640px) 180px, (max-width: 1024px) 250px, (max-width: 1536px) 280px, 320px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            {item.type === "movie" ? (
              <Film className="h-10 w-10 text-muted-foreground" />
            ) : (
              <Tv className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        )}
      </Link>

      {/* Backdrop — visible when open */}
      <Link
        href={href}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* Trailer or backdrop */}
        {showTrailer && item.trailerKey ? (
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              ref={iframeRef}
              src={`https://www.youtube-nocookie.com/embed/${item.trailerKey}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${item.trailerKey}&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}`}
              className="pointer-events-none absolute -inset-[60px] h-[calc(100%+120px)] w-[calc(100%+120px)] border-0"
              allow="autoplay; encrypted-media"
              title={`${item.title} trailer`}
            />
          </div>
        ) : backdropSrc ? (
          <FadeImage
            loader={tmdbBackdropLoader}
            src={backdropSrc}
            alt={item.title}
            fill
            className="object-cover"
            fadeDuration={250}
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ) : posterSrc ? (
          <FadeImage
            loader={tmdbPosterLoader}
            src={posterSrc}
            alt={item.title}
            fill
            className="object-cover blur-sm scale-110"
            fadeDuration={250}
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        ) : null}

        {/* Gradient overlay — less opaque during trailer */}
        <div className={cn(
          "absolute inset-0 transition-opacity duration-500",
          showTrailer ? "bg-gradient-to-t from-black/80 via-transparent to-transparent" : "bg-gradient-to-t from-black/90 via-black/30 to-black/10",
        )} />
        <div className={cn(
          "absolute inset-0 transition-opacity duration-500",
          showTrailer ? "bg-gradient-to-r from-black/40 to-transparent" : "bg-gradient-to-r from-black/50 to-transparent",
        )} />

        {/* Hide button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHide();
          }}
          className={cn(
            "absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/80 text-white/70 opacity-0 transition-opacity duration-200 hover:bg-black/90 hover:text-white group-hover:opacity-100",
            showTrailer ? "left-4 top-4" : "left-2.5 top-2.5",
          )}
          aria-label={`Hide ${item.title}`}
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>

        {/* Mute button */}
        {showTrailer && item.trailerKey && (
          <button
            type="button"
            onClick={toggleMute}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white/70 transition-colors duration-200 hover:border-white/40 hover:bg-black/90 hover:text-white"
          >
            {muted ? <VolumeOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        {/* Content over backdrop */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
          {/* Logo or title */}
          {item.logoPath ? (
            <MediaLogo src={`${TMDB_IMAGE_BASE}/w780${item.logoPath}`} alt={item.title} size="carousel" />
          ) : (
            <h3 className="text-lg font-bold text-white drop-shadow-lg">{item.title}</h3>
          )}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold uppercase tracking-wider text-white/80">
            <span>{item.type === "movie" ? "Movie" : "TV Show"}</span>
            {item.voteAverage !== null && item.voteAverage !== undefined && item.voteAverage > 0 && (
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
          </div>

          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <AddToListButton
              mediaId={item.id}
              externalId={item.externalId}
              provider={item.provider}
              type={item.type}
              title={item.title}
              size="sm"
            />
          </div>
        </div>
      </Link>
    </div>
  );
}
