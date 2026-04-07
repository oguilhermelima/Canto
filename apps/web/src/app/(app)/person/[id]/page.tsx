"use client";

import { use, useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Film,
  Tv,
  MapPin,
  Cake,
  Star,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { mediaHref } from "~/lib/media-href";

interface PersonPageProps {
  params: Promise<{ id: string }>;
}

export default function PersonPage({
  params,
}: PersonPageProps): React.JSX.Element {
  const { id } = use(params);
  const personId = parseInt(id, 10);

  const { data: person, isLoading, isError, refetch } = trpc.media.getPerson.useQuery(
    { personId },
    { enabled: !Number.isNaN(personId) },
  );

  useEffect(() => {
    if (person?.name) {
      document.title = `${person.name} — Canto`;
    }
  }, [person?.name]);

  if (isLoading) return <PersonPageSkeleton />;

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <StateMessage preset="error" onRetry={() => void refetch()} minHeight="60vh" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen bg-background">
        <StateMessage preset="emptyPerson" minHeight="60vh" />
      </div>
    );
  }

  const age = computeAge(person.birthday, person.deathday);

  const topCredit = [...person.movieCredits, ...person.tvCredits].sort(
    (a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0),
  )[0];
  const backdropPath = topCredit?.backdropPath;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero — extends behind topbar with -mt-16 */}
      <section className="relative -mt-16 w-full">
        {/* Backdrop */}
        <div className="relative h-[450px] w-full overflow-hidden bg-muted md:h-[550px]">
          {backdropPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w1280${backdropPath}`}
              alt=""
              fill
              className="object-cover object-top opacity-30"
              priority
              sizes="100vw"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
        </div>

        {/* Profile content */}
        <div className="relative mx-auto -mt-56 w-full px-4 pb-10 md:-mt-64 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-end">
            {/* Profile photo */}
            <div className="relative h-[220px] w-[220px] shrink-0 overflow-hidden rounded-xl bg-muted shadow-2xl ring-4 ring-background md:h-[300px] md:w-[300px]">
              {person.profilePath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/h632${person.profilePath}`}
                  alt={person.name}
                  fill
                  className="object-cover"
                  priority
                  sizes="300px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <User className="h-20 w-20 text-muted-foreground/20" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col items-center pb-4 text-center md:items-start md:text-left">
              {person.knownForDepartment && (
                <p className="mb-1 text-sm font-medium uppercase tracking-wider text-muted-foreground/60">
                  {person.knownForDepartment}
                </p>
              )}

              <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
                {person.name}
              </h1>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground md:justify-start">
                {person.birthday && (
                  <span className="flex items-center gap-1.5">
                    <Cake size={15} className="text-muted-foreground/50" />
                    {formatDate(person.birthday)}
                    {age !== null && !person.deathday && (
                      <span className="text-muted-foreground/50">
                        ({age} years old)
                      </span>
                    )}
                  </span>
                )}

                {person.deathday && (
                  <span className="flex items-center gap-1.5 text-muted-foreground/50">
                    &ndash; {formatDate(person.deathday)}
                    {age !== null && <span>({age})</span>}
                  </span>
                )}

                {person.placeOfBirth && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={15} className="text-muted-foreground/50" />
                    {person.placeOfBirth}
                  </span>
                )}
              </div>

              {/* Stats pills */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {person.movieCredits.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-xs font-medium text-foreground">
                    <Film size={14} />
                    {person.movieCredits.length} Movies
                  </div>
                )}
                {person.tvCredits.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-xs font-medium text-foreground">
                    <Tv size={14} />
                    {person.tvCredits.length} TV Shows
                  </div>
                )}
                {person.popularity > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-xs font-medium text-foreground">
                    <Star
                      size={14}
                      className="fill-yellow-500 text-yellow-500"
                    />
                    {person.popularity.toFixed(0)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Biography — always open */}
      {person.biography && (
        <div className="mx-auto w-full px-4 pt-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <h2 className="mb-3 text-xl font-semibold text-foreground">
            Biography
          </h2>
          <p className="max-w-4xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {person.biography}
          </p>
        </div>
      )}

      {/* Filmography Timeline */}
      <FilmographyTimeline
        movieCredits={person.movieCredits}
        tvCredits={person.tvCredits}
      />

      {/* Photo Gallery */}
      {person.images.length > 1 && (
        <div className="mt-16 pb-16 md:mt-20">
          <PhotoGallery images={person.images} name={person.name} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Filmography Timeline                                                      */
/* -------------------------------------------------------------------------- */

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

function FilmographyTimeline({
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
    <div className="mx-auto mt-16 w-full px-4 md:mt-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <h2 className="mb-10 text-xl font-semibold text-foreground">
        Filmography
      </h2>

      <div className="relative ml-4 border-l-2 border-border/40 md:ml-8">
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
              <Film className="h-5 w-5 text-muted-foreground/15" />
            ) : (
              <Tv className="h-5 w-5 text-muted-foreground/15" />
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
            <span className="font-medium text-foreground/70">
              {credit.character}
            </span>
          </p>
        )}

        {credit.voteAverage != null && credit.voteAverage > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            <Star size={11} className="fill-yellow-500 text-yellow-500" />
            <span className="text-xs text-muted-foreground">
              {credit.voteAverage.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Photo Gallery                                                             */
/* -------------------------------------------------------------------------- */

function PhotoGallery({
  images,
  name,
}: {
  images: { filePath: string; aspectRatio: number }[];
  name: string;
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  const scroll = useCallback(
    (dir: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollBy({
        left: dir === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8,
        behavior: "smooth",
      });
      setTimeout(updateScroll, 350);
    },
    [updateScroll],
  );

  return (
    <section className="relative">
      <h2 className="mb-4 pl-4 text-xl font-semibold text-foreground md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        Photos
      </h2>
      <div className="group/carousel relative">
        {canScrollLeft && (
          <button
            className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("left")}
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {canScrollRight && (
          <button
            className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 transition-opacity group-hover/carousel:opacity-100 md:flex lg:w-16"
            onClick={() => scroll("right")}
          >
            <ChevronRight size={28} />
          </button>
        )}
        <div
          ref={scrollRef}
          onScroll={updateScroll}
          className="flex gap-4 overflow-x-auto pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {images.map((img) => (
            <div
              key={img.filePath}
              className="relative h-[280px] w-[190px] shrink-0 overflow-hidden rounded-xl bg-muted md:h-[340px] md:w-[230px]"
            >
              <Image
                src={`https://image.tmdb.org/t/p/w780${img.filePath}`}
                alt={name}
                fill
                className="object-cover"
                loading="lazy"
                sizes="230px"
              />
            </div>
          ))}
          <div className="w-4 shrink-0 md:w-8 lg:w-12 xl:w-16 2xl:w-24" />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

function PersonPageSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative -mt-16 w-full">
        <div className="relative h-[450px] w-full overflow-hidden bg-muted md:h-[550px]">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        </div>
        <div className="relative mx-auto -mt-56 w-full px-4 pb-10 md:-mt-64 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-end">
            <Skeleton className="h-[220px] w-[220px] rounded-xl md:h-[300px] md:w-[300px]" />
            <div className="flex flex-col items-center gap-3 pb-4 md:items-start">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-72 md:h-14 md:w-96" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
                <Skeleton className="h-9 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full px-4 pt-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <Skeleton className="mb-3 h-7 w-32" />
        <div className="max-w-4xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      <div className="mx-auto mt-16 w-full px-4 md:mt-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <Skeleton className="mb-10 h-7 w-40" />
        <div className="ml-8 border-l-2 border-border/40">
          {Array.from({ length: 4 }).map((_, gi) => (
            <div key={gi} className="mb-10">
              <div className="-ml-[13px] mb-4 flex items-center gap-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-8 w-16" />
              </div>
              <div className="ml-10 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3">
                    <Skeleton className="h-[90px] w-[60px] rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function computeAge(
  birthday: string | null,
  deathday: string | null,
): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && end.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
