"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, MessageSquareText, MoreHorizontal, Pencil } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc/client";
import { DeleteReviewButton } from "./delete-review-button";
import { EpisodeRatingForm } from "./episode-rating-form";
import { EpisodeReviewCard } from "./episode-review-card";

interface EpisodeReviewsSectionProps {
  episodeId: string;
  mediaId: string;
  seasonId: string;
  showExternalId: string;
}

export function EpisodeReviewsSection({
  episodeId,
  mediaId,
  seasonId,
  showExternalId,
}: EpisodeReviewsSectionProps): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const utils = trpc.useUtils();
  const { data: reviewsData, isLoading } = trpc.userMedia.getMediaReviews.useQuery({
    mediaId,
    episodeId,
    limit: 12,
  });
  const { data: userRatings } = trpc.userMedia.getRatings.useQuery({ mediaId });
  const [isEditing, setIsEditing] = useState(false);

  const userEpisodeRating = useMemo(
    () => userRatings?.find((r) => r.episodeId === episodeId),
    [userRatings, episodeId],
  );

  const total = reviewsData?.total ?? 0;
  const otherReviews = useMemo(() => {
    const reviews = reviewsData?.reviews ?? [];
    return reviews.filter((r) => r.user.id !== session?.user.id);
  }, [reviewsData?.reviews, session?.user]);
  const hasMore = total > 12;

  const invalidateAll = () => {
    void utils.userMedia.getRatings.invalidate({ mediaId });
    void utils.userMedia.getMediaReviews.invalidate();
  };

  const hasReview = !!userEpisodeRating;
  const allReviewsHref = `/shows/${showExternalId}/reviews`;

  return (
    <div className="mt-12">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground md:text-xl">
          <MessageSquareText size={18} className="text-muted-foreground" />
          Reviews
          {total > 0 && <span className="text-sm font-normal text-muted-foreground">({total})</span>}
        </h3>
        {hasMore && (
          <Link
            href={allReviewsHref}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="hidden md:inline">See all</span>
            <ChevronRight size={16} />
          </Link>
        )}
      </div>

      {hasReview && !isEditing ? (
        <EpisodeReviewCard
          name={session?.user.name ?? "You"}
          image={session?.user.image ?? null}
          rating={userEpisodeRating.rating}
          comment={userEpisodeRating.comment}
          date={userEpisodeRating.createdAt}
          menu={
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground">
                  <MoreHorizontal size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-36 p-1">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-muted" onClick={() => setIsEditing(true)}>
                  <Pencil size={14} /> Edit
                </button>
                <DeleteReviewButton mediaId={mediaId} episodeId={episodeId} onDelete={() => { invalidateAll(); setIsEditing(false); }} />
              </PopoverContent>
            </Popover>
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card/50 p-4">
          <EpisodeRatingForm
            mediaId={mediaId}
            seasonId={seasonId}
            episodeId={episodeId}
            initialRating={userEpisodeRating?.rating ?? null}
            initialComment={userEpisodeRating?.comment ?? null}
            onSuccess={() => { invalidateAll(); setIsEditing(false); }}
            onCancel={hasReview ? () => setIsEditing(false) : undefined}
          />
        </div>
      )}

      {(isLoading || otherReviews.length > 0) && (
        <div className="mt-8">
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
            Community
            {otherReviews.length > 0 && (
              <span className="ml-1.5 text-muted-foreground">{otherReviews.length}</span>
            )}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card/50 p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  </div>
                ))
              : otherReviews.map((review) => (
                  <EpisodeReviewCard
                    key={review.id}
                    name={review.user.name ?? "Anonymous"}
                    image={review.user.image}
                    rating={review.rating}
                    comment={review.comment}
                    date={review.createdAt}
                  />
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
