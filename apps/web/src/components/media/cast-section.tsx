"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

/** Collapsed height — enough for one row including character names */
const COLLAPSED_HEIGHT = 230;

export function CastSection({
  credits,
  isLoading = false,
  className,
}: CastSectionProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fullHeight, setFullHeight] = useState<number>(0);

  const measure = useCallback(() => {
    if (contentRef.current) {
      setFullHeight(contentRef.current.scrollHeight);
    }
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, credits]);

  if (!isLoading && credits.length === 0) {
    return <></>;
  }

  const sorted = credits.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const hasMore = fullHeight > COLLAPSED_HEIGHT;

  return (
    <section className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Cast</h2>
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

      <div className="relative" style={{ minHeight: COLLAPSED_HEIGHT }}>
        <div
          ref={contentRef}
          className="-m-2 grid grid-cols-4 justify-items-center gap-x-2 gap-y-4 overflow-hidden p-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8"
          style={{
            height: showAll ? fullHeight : COLLAPSED_HEIGHT,
            transition: fullHeight ? "height 400ms cubic-bezier(0.4, 0, 0.2, 1)" : "none",
          }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <CastCardSkeleton key={i} />
              ))
            : sorted.map((member, i) => (
                <CastCard key={`${member.id}-${i}`} {...member} />
              ))}
        </div>
        {hasMore && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="absolute inset-x-0 bottom-0 h-16 cursor-pointer bg-gradient-to-t from-background to-transparent"
          />
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
      className="group w-full max-w-[130px] transition-transform duration-200 hover:scale-105"
    >
      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-full bg-muted ring-2 ring-border/20 transition-[filter] duration-200 group-hover:brightness-110">
        {profilePath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w342${profilePath}`}
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
        <p className="text-center text-sm text-muted-foreground/60">
          {character}
        </p>
      )}
    </Link>
  );
}

function CastCardSkeleton(): React.JSX.Element {
  return (
    <div className="w-full max-w-[130px]">
      <Skeleton className="mb-2 aspect-square w-full rounded-full" />
      <Skeleton className="mx-auto h-4 w-16" />
      <Skeleton className="mx-auto mt-1 h-3 w-12" />
    </div>
  );
}
