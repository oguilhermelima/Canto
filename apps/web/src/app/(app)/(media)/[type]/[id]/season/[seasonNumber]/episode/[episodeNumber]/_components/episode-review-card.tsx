"use client";

import Image from "next/image";
import { Star } from "lucide-react";

interface EpisodeReviewCardProps {
  name: string;
  image: string | null;
  rating: number;
  comment?: string | null;
  date: Date;
  menu?: React.ReactNode;
}

export function EpisodeReviewCard({
  name,
  image,
  rating,
  comment,
  date,
  menu,
}: EpisodeReviewCardProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
            {image ? (
              <Image src={image} alt={name} width={40} height={40} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-sm font-bold text-foreground">
            {rating}
            <Star size={14} className="fill-yellow-500 text-yellow-500" />
          </span>
          {menu}
        </div>
      </div>
      {comment && (
        <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
          {comment}
        </p>
      )}
    </div>
  );
}
