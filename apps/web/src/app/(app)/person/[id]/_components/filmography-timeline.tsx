"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Film, Tv } from "lucide-react";
import { mediaHref } from "@/lib/media-href";
import { RatingInline } from "@/components/media/rating-badge";

interface CreditItem {
  id: number;
  title: string;
  character?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  year?: number;
  voteAverage?: number;
  mediaType: "movie" | "show";
}

function TimelineCard({
  credit,
}: {
  credit: CreditItem;
}): React.JSX.Element {
  const href = mediaHref("tmdb", credit.id, credit.mediaType);

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-card"
    >
      {/* Poster */}
      <div className="relative h-[90px] w-[60px] shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
        {credit.posterPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w200${credit.posterPath}`}
            alt={credit.title}
            fill
            className="object-cover"
            sizes="60px"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {credit.mediaType === "movie" ? (
              <Film className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Tv className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
            {credit.title}
          </h3>
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
            {credit.mediaType === "movie" ? "Film" : "TV"}
          </span>
        </div>

        {credit.character && (
          <p className="mt-1 text-sm text-muted-foreground">
            as{" "}
            <span className="font-medium text-foreground">
              {credit.character}
            </span>
          </p>
        )}

        {credit.voteAverage !== undefined && credit.voteAverage > 0 && (
          <div className="mt-1.5">
            <RatingInline variant="public" value={credit.voteAverage} />
          </div>
        )}
      </div>
    </Link>
  );
}

export function FilmographyTimeline({
  movieCredits,
  tvCredits,
}: {
  movieCredits: CreditItem[];
  tvCredits: CreditItem[];
}): React.JSX.Element {
  const grouped = useMemo(() => {
    const combined = [
      ...movieCredits.map((c) => ({ ...c, mediaType: "movie" as const })),
      ...tvCredits.map((c) => ({ ...c, mediaType: "show" as const })),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const deduped = combined.filter((c) => {
      const key = `${c.mediaType}-${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: upcoming (no year) first, then year desc, then vote desc
    deduped.sort((a, b) => {
      const ya = a.year ?? Infinity;
      const yb = b.year ?? Infinity;
      if (ya !== yb) return yb - ya;
      return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
    });

    // Group by year
    const map = new Map<string, CreditItem[]>();
    for (const credit of deduped) {
      const key = credit.year ? String(credit.year) : "Upcoming";
      const arr = map.get(key) ?? [];
      arr.push(credit);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [movieCredits, tvCredits]);

  if (grouped.length === 0) return <></>;

  return (
    <div className="mx-auto mt-8 w-full px-4 md:mt-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <h2 className="mb-6 text-base font-semibold text-foreground md:mb-10 md:text-xl">
        Filmography
      </h2>

      <div className="relative ml-4 border-l-2 border-border md:ml-8">
        {grouped.map(([year, credits], groupIdx) => (
          <div
            key={year}
            className={groupIdx < grouped.length - 1 ? "mb-10" : ""}
          >
            {/* Year marker */}
            <div className="relative -ml-[13px] mb-4 flex items-center gap-4 md:-ml-[13px]">
              <div className="h-6 w-6 rounded-full border-4 border-background bg-foreground" />
              <span className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                {year}
              </span>
            </div>

            {/* Credits for this year */}
            <div className="ml-6 flex flex-col gap-2 md:ml-10">
              {credits.map((credit, i) => (
                <TimelineCard
                  key={`${credit.id}-${credit.mediaType}-${i}`}
                  credit={credit}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
