"use client";

import Image from "next/image";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { User } from "lucide-react";

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

export function CastSection({
  credits,
  isLoading = false,
  className,
}: CastSectionProps): React.JSX.Element {
  if (!isLoading && credits.length === 0) {
    return <></>;
  }

  return (
    <section className={className}>
      <h2 className="mb-4 text-xl font-semibold text-foreground">Cast</h2>

      <div
        className="flex gap-4 overflow-x-auto pb-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <CastCardSkeleton key={i} />
            ))
          : credits
              .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
              .slice(0, 20)
              .map((member) => (
                <CastCard key={member.id} {...member} />
              ))}
      </div>
    </section>
  );
}

function CastCard({
  name,
  character,
  profilePath,
}: CastMember): React.JSX.Element {
  return (
    <div className="w-[120px] shrink-0">
      {/* Profile photo */}
      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-full bg-muted">
        {profilePath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${profilePath}`}
            alt={name}
            fill
            className="object-cover"
            sizes="120px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Name */}
      <p className="line-clamp-1 text-center text-sm font-medium text-foreground">
        {name}
      </p>

      {/* Character */}
      {character && (
        <p className="line-clamp-1 text-center text-xs text-muted-foreground">
          {character}
        </p>
      )}
    </div>
  );
}

function CastCardSkeleton(): React.JSX.Element {
  return (
    <div className="w-[120px] shrink-0">
      <Skeleton className="mb-2 aspect-square w-full rounded-full" />
      <Skeleton className="mx-auto h-4 w-20" />
      <Skeleton className="mx-auto mt-1 h-3 w-16" />
    </div>
  );
}
