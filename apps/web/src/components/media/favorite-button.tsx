"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";

interface FavoriteButtonProps {
  mediaId: string;
  isFavorite: boolean;
}

export function FavoriteButton({ mediaId, isFavorite: initialFavorite }: FavoriteButtonProps) {
  const utils = trpc.useUtils();
  const [optimistic, setOptimistic] = useState(initialFavorite);

  const mutation = trpc.userMedia.toggleFavorite.useMutation({
    onMutate: () => {
      setOptimistic((prev) => !prev);
    },
    onError: () => {
      setOptimistic(initialFavorite);
    },
    onSettled: () => {
      void utils.userMedia.getState.invalidate({ mediaId });
      void utils.userMedia.getUserMediaCounts.invalidate();
      void utils.userMedia.getUserMedia.invalidate();
    },
  });

  // Sync with server state when prop changes
  if (initialFavorite !== optimistic && !mutation.isPending) {
    setOptimistic(initialFavorite);
  }

  return (
    <button
      type="button"
      onClick={() => mutation.mutate({ mediaId, isFavorite: !optimistic })}
      disabled={mutation.isPending}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl border backdrop-blur-md transition-all",
        optimistic
          ? "border-red-500/30 bg-red-500/10 text-red-500"
          : "border-foreground/10 bg-foreground/15 text-foreground/70 hover:bg-foreground/25 hover:text-foreground",
      )}
      aria-label={optimistic ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={cn("h-5 w-5 transition-all", optimistic && "fill-current")}
      />
    </button>
  );
}
