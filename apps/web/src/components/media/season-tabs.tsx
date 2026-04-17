"use client";

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { ChevronLeft, ChevronRight, Clapperboard } from "lucide-react";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { EpisodeCard } from "./episode-card";
import type { Episode, EpisodeDownloadInfo } from "./episode-card";

interface Season {
  id: string;
  seasonNumber: number;
  name: string;
  overview?: string | null;
  episodeCount?: number | null;
  airDate?: string | null;
  posterPath?: string | null;
  episodes?: Episode[];
}

interface SeasonTabsProps {
  seasons: Season[];
  showExternalId: string;
  userRatings?: Map<string, number>;
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
  serverLinks?: { jellyfin?: { url: string }; plex?: { url: string } };
  className?: string;
}

export function SeasonTabs({
  seasons,
  showExternalId,
  userRatings,
  downloadedEpisodes,
  episodeAvailability,
  serverLinks,
  className,
}: SeasonTabsProps): React.JSX.Element {
  const filteredSeasons = useMemo(
    () =>
      [...seasons]
        .filter((s) => (s.episodes?.length ?? 0) > 0)
        .sort((a, b) => {
          if (a.seasonNumber === 0 && b.seasonNumber !== 0) return 1;
          if (b.seasonNumber === 0 && a.seasonNumber !== 0) return -1;
          return a.seasonNumber - b.seasonNumber;
        }),
    [seasons],
  );

  if (filteredSeasons.length === 0) return <></>;

  return (
    <section className={cn("relative", className)}>
      <h2 className="mb-4 flex items-center gap-2 pl-4 text-base font-semibold text-foreground md:pl-8 md:text-xl lg:pl-12 xl:pl-16 2xl:pl-24">
        <Clapperboard size={18} className="text-muted-foreground" />
        Seasons
      </h2>

      <div className="flex flex-col gap-5">
        {filteredSeasons.map((season) => (
          <SeasonBlock
            key={season.id}
            season={season}
            showExternalId={showExternalId}
            userRatings={userRatings}
            downloadedEpisodes={downloadedEpisodes}
            episodeAvailability={episodeAvailability}
            serverLinks={serverLinks}
          />
        ))}
      </div>
    </section>
  );
}

/* ─── Season Block (always expanded) ─── */

function SeasonBlock({
  season,
  showExternalId,
  userRatings,
  downloadedEpisodes,
  episodeAvailability,
  serverLinks,
}: {
  season: Season;
  showExternalId: string;
  userRatings?: Map<string, number>;
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
  serverLinks?: { jellyfin?: { url: string }; plex?: { url: string } };
}): React.JSX.Element {
  const episodes = useMemo(
    () =>
      (season.episodes ?? []).sort(
        (a, b) => a.episodeNumber - b.episodeNumber,
      ),
    [season.episodes],
  );

  const jellyfinEpCount = episodeAvailability
    ? episodes.filter((ep) => {
        const key = `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        return episodeAvailability[key]?.some((a) => a.type === "jellyfin");
      }).length
    : 0;
  const plexEpCount = episodeAvailability
    ? episodes.filter((ep) => {
        const key = `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        return episodeAvailability[key]?.some((a) => a.type === "plex");
      }).length
    : 0;

  const isSpecials = season.seasonNumber === 0;
  const sNum = String(season.seasonNumber).padStart(2, "0");
  const epCount = episodes.length || season.episodeCount || 0;
  const year = season.airDate
    ? new Date(season.airDate).getFullYear()
    : null;
  const rawTitle = season.name || `Season ${season.seasonNumber}`;
  const seasonTitle = isSpecials
    ? "Specials"
    : rawTitle.replace(
        /^(?:s(?:eason)?\s*0*\d+)\s*[•·\-–—:|]\s*/i,
        "",
      ) || rawTitle;

  const seasonHref = `/shows/${showExternalId}/season/${season.seasonNumber}`;

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center gap-3 pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <Link href={seasonHref} className="min-w-0 flex-1 group">
          <h3 className="truncate text-sm font-bold leading-tight sm:text-base">
            {isSpecials ? (
              <span>{seasonTitle}</span>
            ) : (
              <>
                <span>S{sNum}</span>
                <span className="mx-1.5 text-muted-foreground sm:mx-2">|</span>
                <span className="group-hover:underline">{seasonTitle}</span>
              </>
            )}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{epCount} episodes</span>
            {year && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{year}</span>
              </>
            )}
          </div>
        </Link>

        <div className="flex items-center gap-2.5">
          {/* Server badges */}
          {jellyfinEpCount > 0 && serverLinks?.jellyfin && (() => {
            const fullyAvailable = jellyfinEpCount >= epCount;
            const label = fullyAvailable
              ? "Fully available on Jellyfin"
              : `Partially available on Jellyfin (${jellyfinEpCount}/${epCount})`;
            return (
              <a
                href={serverLinks.jellyfin.url}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                className="hidden h-7 w-7 items-center justify-center rounded-lg border border-[#a95ce0]/20 bg-gradient-to-r from-[#a95ce0]/10 to-[#4bb8e8]/10 transition-colors hover:from-[#a95ce0]/20 hover:to-[#4bb8e8]/20 sm:flex"
              >
                <span
                  className="inline-block h-3.5 w-3.5 shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #a95ce0, #4bb8e8)",
                    mask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                    WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                  }}
                />
              </a>
            );
          })()}
          {plexEpCount > 0 && serverLinks?.plex && (() => {
            const fullyAvailable = plexEpCount >= epCount;
            const label = fullyAvailable
              ? "Fully available on Plex"
              : `Partially available on Plex (${plexEpCount}/${epCount})`;
            return (
              <a
                href={serverLinks.plex.url}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                className="hidden h-7 w-7 items-center justify-center rounded-lg border border-[#e5a00d]/20 bg-[#e5a00d]/10 transition-colors hover:bg-[#e5a00d]/20 sm:flex"
              >
                <span
                  className="inline-block h-3.5 w-3.5 shrink-0 bg-[#e5a00d]"
                  style={{
                    mask: "url(/plex-logo.svg) center/contain no-repeat",
                    WebkitMask: "url(/plex-logo.svg) center/contain no-repeat",
                  }}
                />
              </a>
            );
          })()}

          {/* See more link */}
          <Link
            href={seasonHref}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="hidden sm:inline">See more</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Episodes — always visible */}
      {episodes.length > 0 ? (
        <EpisodeScrollGrid
          episodes={episodes}
          seasonNumber={season.seasonNumber}
          showExternalId={showExternalId}
          userRatings={userRatings}
          downloadedEpisodes={downloadedEpisodes}
          episodeAvailability={episodeAvailability}
        />
      ) : (
        <div className="pl-4 pr-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-10 text-xs text-muted-foreground">
            No episodes available
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Episode Scroll Grid with Arrows ─── */

function EpisodeScrollGrid({
  episodes,
  seasonNumber,
  showExternalId,
  userRatings,
  downloadedEpisodes,
  episodeAvailability,
}: {
  episodes: Episode[];
  seasonNumber: number;
  showExternalId: string;
  userRatings?: Map<string, number>;
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
}): React.JSX.Element {
  const { containerRef, canScrollLeft, canScrollRight, scrollLeft, scrollRight, handleScroll } =
    useScrollCarousel();

  return (
    <div className="group/episodes relative">
      {canScrollLeft && (
        <button
          aria-label="Scroll left"
          className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background from-30% to-transparent text-foreground opacity-0 transition-opacity group-hover/episodes:opacity-100 md:flex"
          onClick={scrollLeft}
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {canScrollRight && (
        <button
          aria-label="Scroll right"
          className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background from-30% to-transparent text-foreground opacity-0 transition-opacity group-hover/episodes:opacity-100 md:flex"
          onClick={scrollRight}
        >
          <ChevronRight size={22} />
        </button>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto pb-2 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
      >
        {episodes.map((ep) => (
          <EpisodeCard
            key={ep.id}
            episode={ep}
            seasonNumber={seasonNumber}
            showExternalId={showExternalId}
            userRating={userRatings?.get(ep.id)}
            downloadInfo={downloadedEpisodes?.get(ep.id)}
            serverAvailability={episodeAvailability?.[
              `S${String(seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
            ]}
          />
        ))}
      </div>
    </div>
  );
}
