"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";

interface EpisodeRatingFormProps {
  mediaId: string;
  seasonId: string;
  episodeId: string;
  initialRating: number | null;
  initialComment: string | null;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function EpisodeRatingForm({
  mediaId,
  seasonId,
  episodeId,
  initialRating,
  initialComment,
  onSuccess,
  onCancel,
}: EpisodeRatingFormProps): React.JSX.Element {
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(initialRating);
  const [comment, setComment] = useState(initialComment ?? "");

  useEffect(() => { setSelectedRating(initialRating); }, [initialRating]);
  useEffect(() => { setComment(initialComment ?? ""); }, [initialComment]);

  const rateMutation = trpc.userMedia.rate.useMutation({
    onSuccess: () => { onSuccess(); toast.success("Review saved"); },
    onError: (err) => toast.error(err.message),
  });

  const displayRating = hoverRating ?? selectedRating ?? 0;

  const handleSubmit = () => {
    if (!selectedRating) return;
    rateMutation.mutate({
      mediaId, seasonId, episodeId,
      rating: selectedRating,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => {
          const value = i + 1;
          const isActive = value <= displayRating;
          return (
            <button
              key={value}
              type="button"
              className="group p-0.5 transition-transform hover:scale-110 active:scale-95"
              onMouseEnter={() => setHoverRating(value)}
              onMouseLeave={() => setHoverRating(null)}
              onClick={() => setSelectedRating(value)}
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive
                    ? "fill-yellow-500 text-yellow-500"
                    : "text-foreground group-hover:text-foreground",
                )}
              />
            </button>
          );
        })}
        {selectedRating && selectedRating > 0 && (
          <span className="ml-2 text-sm font-medium text-muted-foreground">
            {selectedRating}/10
          </span>
        )}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your thoughts on this episode..."
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border-0 bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
      />

      <div className="mt-2.5 flex items-center justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className="rounded-xl text-xs"
          onClick={handleSubmit}
          disabled={rateMutation.isPending || !selectedRating}
        >
          {rateMutation.isPending ? "Saving..." : initialRating ? "Update" : "Post Review"}
        </Button>
      </div>
    </div>
  );
}
