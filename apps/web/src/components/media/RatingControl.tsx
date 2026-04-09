"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";

interface RatingControlProps {
  mediaId: string;
  initialRating?: number | null;
}

export function RatingControl({
  mediaId,
  initialRating,
}: RatingControlProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const rateMutation = trpc.userMedia.rate.useMutation({
    onSuccess: () => {
      void utils.userMedia.getState.invalidate({ mediaId });
    },
  });

  const rating = initialRating ?? 0;
  const currentDisplayRating = hoverRating ?? rating;

  const handleRate = (value: number) => {
    rateMutation.mutate({ mediaId, rating: value });
  };

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }).map((_, i) => {
        const value = i + 1;
        const isActive = value <= currentDisplayRating;

        return (
          <button
            key={value}
            type="button"
            className="group relative p-0.5 transition-transform hover:scale-110 active:scale-95"
            onMouseEnter={() => setHoverRating(value)}
            onMouseLeave={() => setHoverRating(null)}
            onClick={() => handleRate(value)}
          >
            <Star
              className={cn(
                "h-5 w-5 transition-colors",
                isActive
                  ? "fill-yellow-500 text-yellow-500"
                  : "text-foreground/20 group-hover:text-foreground/40"
              )}
            />
          </button>
        );
      })}
      {rating > 0 && (
        <span className="ml-2 text-sm font-medium text-foreground/60">
          {rating}/10
        </span>
      )}
    </div>
  );
}
