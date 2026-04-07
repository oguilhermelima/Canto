"use client";

import Image from "next/image";
import { Film, Tv, Star, MapPin, Cake, User } from "lucide-react";
import { computeAge, formatDate } from "./helpers";

interface PersonHeroProps {
  person: {
    name: string;
    profilePath: string | null;
    knownForDepartment: string | null;
    birthday: string | null;
    deathday: string | null;
    placeOfBirth: string | null;
    popularity: number;
    movieCredits: { backdropPath?: string; voteAverage?: number }[];
    tvCredits: { backdropPath?: string; voteAverage?: number }[];
  };
}

export function PersonHero({ person }: PersonHeroProps): React.JSX.Element {
  const age = computeAge(person.birthday, person.deathday);

  const topCredit = [...person.movieCredits, ...person.tvCredits].sort(
    (a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0),
  )[0];
  const backdropPath = topCredit?.backdropPath;

  return (
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
  );
}
