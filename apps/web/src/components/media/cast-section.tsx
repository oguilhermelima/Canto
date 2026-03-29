"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@canto/ui/skeleton";
import { User, ChevronDown } from "lucide-react";

interface CastMember {
  id: string;
  name: string;
  character?: string | null;
  profilePath?: string | null;
  order?: number | null;
}

interface CastSectionProps {
  credits: CastMember[];
  isLoading?: boolean;
  className?: string;
}

/** Height that fits exactly one row of cast cards (130px image + ~50px text) */
const ONE_ROW_HEIGHT = 190;

export function CastSection({
  credits,
  isLoading = false,
  className,
}: CastSectionProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);

  if (!isLoading && credits.length === 0) {
    return <></>;
  }

  const sorted = credits.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  // Show all items but clip to one row via maxHeight when collapsed
  const hasMore = sorted.length > 6;

  return (
    <section className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Cast</h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((p) => !p)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showAll ? "Show less" : "See all"}
            <ChevronDown
              size={14}
              className={showAll ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </button>
        )}
      </div>

      <div className="relative">
        <div
          className="flex flex-wrap gap-6 overflow-hidden transition-[max-height] duration-500 ease-in-out"
          style={{ maxHeight: showAll ? `${sorted.length * ONE_ROW_HEIGHT}px` : `${ONE_ROW_HEIGHT}px` }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <CastCardSkeleton key={i} />
              ))
            : sorted.map((member) => (
                <CastCard key={member.id} {...member} />
              ))}
        </div>
        {hasMore && !showAll && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
    </section>
  );
}

function CastCard({
  id,
  name,
  character,
  profilePath,
}: CastMember): React.JSX.Element {
  return (
    <Link
      href={`/person/${id}`}
      className="group w-[110px] shrink-0 transition-transform duration-200 hover:scale-105 sm:w-[130px]"
    >
      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-full bg-muted ring-2 ring-border/20 transition-[filter] duration-200 group-hover:brightness-110">
        {profilePath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${profilePath}`}
            alt={name}
            fill
            className="object-cover"
            sizes="130px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground/15" />
          </div>
        )}
      </div>
      <p className="line-clamp-1 text-center text-sm font-medium text-foreground">
        {name}
      </p>
      {character && (
        <p className="line-clamp-1 text-center text-xs text-muted-foreground/60">
          {character}
        </p>
      )}
    </Link>
  );
}

function CastCardSkeleton(): React.JSX.Element {
  return (
    <div className="w-[110px] shrink-0 sm:w-[130px]">
      <Skeleton className="mb-2 aspect-square w-full rounded-full" />
      <Skeleton className="mx-auto h-4 w-16" />
      <Skeleton className="mx-auto mt-1 h-3 w-12" />
    </div>
  );
}
