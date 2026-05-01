"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "@/lib/trpc/client";

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
  // Optimistic rating overrides the prop only after a local click; cleared
  // back to the server value whenever the prop refetches.
  const [optimisticRating, setOptimisticRating] = useState<number | null>(null);
  const [optimisticForRating, setOptimisticForRating] = useState<number | null | undefined>(initialRating);

  if (optimisticForRating !== initialRating) {
    setOptimisticForRating(initialRating);
    setOptimisticRating(null);
  }

  const selectedRating = optimisticRating ?? initialRating ?? 0;

  const rateMutation = trpc.userMedia.rate.useMutation({
    onSuccess: () => {
      void utils.userMedia.getState.invalidate({ mediaId });
    },
  });

  const currentDisplayRating = hoverRating ?? selectedRating;

  const handleRate = (value: number) => {
    setOptimisticRating(value);
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
                  : "text-foreground group-hover:text-foreground"
              )}
            />
          </button>
        );
      })}
      {selectedRating > 0 && (
        <span className="ml-2 text-sm font-medium text-foreground">
          {selectedRating}/10
        </span>
      )}
    </div>
  );
}
