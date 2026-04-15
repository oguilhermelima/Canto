"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquareText, MoreHorizontal, Pencil, SquarePen, Star, Trash2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { StateMessage } from "~/components/layout/state-message";
import { cn } from "@canto/ui/cn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { useScrollCarousel } from "~/hooks/use-scroll-carousel";
import { toast } from "sonner";

const SCROLL_LIMIT = 20;

export function MediaReviewSection({
  mediaId,
  showExternalId,
  mediaType,
}: {
  mediaId: string;
  showExternalId: string;
  mediaType: "movie" | "show";
}): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const utils = trpc.useUtils();
  const { data: reviewsData, isLoading } = trpc.userMedia.getMediaReviews.useQuery({
    mediaId,
    limit: SCROLL_LIMIT,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const allReviews = reviewsData?.reviews ?? [];
  const total = reviewsData?.total ?? 0;
  const userId = session?.user?.id;

  // Check if user already has a media-level review
  const hasMediaReview = allReviews.some(
    (r) => r.user.id === userId && !r.seasonId && !r.episodeId,
  );

  const deleteRating = trpc.userMedia.removeRating.useMutation({
    onSuccess: () => { invalidate(); toast.success("Review deleted"); },
    onError: (err) => toast.error(err.message),
  });

  const invalidate = () => {
    void utils.userMedia.getRatings.invalidate({ mediaId });
    void utils.userMedia.getState.invalidate({ mediaId });
    void utils.userMedia.getMediaReviews.invalidate({ mediaId });
  };

  const basePath = `/${mediaType === "show" ? "shows" : "movies"}/${showExternalId}`;
  const reviewsPath = `${basePath}/reviews`;

  function reviewLabel(r: { seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; seasonId: string | null; episodeId: string | null }): string {
    if (r.episodeNumber != null) {
      const tag = `S${String(r.seasonNumber ?? 0).padStart(2, "0")}E${String(r.episodeNumber).padStart(2, "0")}`;
      return r.episodeTitle ? `${tag} · ${r.episodeTitle}` : tag;
    }
    if (r.seasonId && !r.episodeId) return `Season ${r.seasonNumber ?? "?"}`;
    return mediaType === "show" ? "Series" : "Movie";
  }

  return (
    <section className="relative">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground md:text-xl">
            <MessageSquareText size={18} className="text-muted-foreground" />
            Reviews
            {total > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({total})</span>
            )}
          </h2>
          {!hasMediaReview && !showForm && !isEditing && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-80"
              title="Write a review"
            >
              <SquarePen size={14} />
              <span className="hidden sm:inline">Review</span>
            </button>
          )}
        </div>
        <Link
          href={reviewsPath}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="hidden md:inline">See more</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Edit/create form */}
      {(isEditing || showForm) && (
        <div className="mb-4 animate-in fade-in-0 slide-in-from-top-2 px-4 duration-300 ease-out md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <ReviewForm
            mediaId={mediaId}
            onSuccess={() => { invalidate(); setIsEditing(false); setShowForm(false); }}
            onCancel={() => { setIsEditing(false); setShowForm(false); }}
          />
        </div>
      )}

      {/* Reviews horizontal scroll */}
      {isLoading ? (
        <div className="flex gap-4 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-[300px] shrink-0 rounded-2xl border border-border/50 bg-card p-4 sm:w-[340px]">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : allReviews.length === 0 ? (
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <StateMessage preset="emptyReviews" minHeight="120px" />
        </div>
      ) : (
        <ReviewScrollGrid
          reviews={allReviews}
          userId={userId}
          reviewsPath={reviewsPath}
          reviewLabel={reviewLabel}
          onEdit={() => setIsEditing(true)}
          onDelete={(review) => deleteRating.mutate({
            mediaId,
            seasonId: review.seasonId ?? undefined,
            episodeId: review.episodeId ?? undefined,
          })}
        />
      )}
    </section>
  );
}

/* ─── Review Scroll Grid ─── */

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  seasonId: string | null;
  episodeId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  user: { id: string; name: string | null; image: string | null };
}

function ReviewScrollGrid({
  reviews,
  userId,
  reviewsPath,
  reviewLabel,
  onEdit,
  onDelete,
}: {
  reviews: ReviewData[];
  userId?: string;
  reviewsPath: string;
  reviewLabel: (r: ReviewData) => string;
  onEdit: () => void;
  onDelete: (review: ReviewData) => void;
}): React.JSX.Element {
  const { containerRef, canScrollLeft, canScrollRight, scrollLeft, scrollRight, handleScroll } =
    useScrollCarousel();

  return (
    <div className="group/reviews relative">
      {canScrollLeft && (
        <button
          aria-label="Scroll left"
          className="absolute left-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-r from-background from-30% to-transparent text-foreground opacity-0 transition-opacity group-hover/reviews:opacity-100 md:flex"
          onClick={scrollLeft}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {canScrollRight && (
        <button
          aria-label="Scroll right"
          className="absolute right-0 top-0 z-20 hidden h-full w-14 items-center justify-center bg-gradient-to-l from-background from-30% to-transparent text-foreground opacity-0 transition-opacity group-hover/reviews:opacity-100 md:flex"
          onClick={scrollRight}
        >
          <ChevronRight size={22} />
        </button>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto pb-2 pl-4 scrollbar-none md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24"
      >
        {reviews.map((review) => {
          const isOwn = review.user.id === userId;
          return (
            <ReviewCard
              key={review.id}
              href={`${reviewsPath}/${review.id}`}
              name={review.user.name ?? "Anonymous"}
              image={review.user.image}
              rating={review.rating}
              comment={review.comment}
              date={review.createdAt}
              label={reviewLabel(review)}
              menu={isOwn ? (
                <ReviewMenu
                  onEdit={onEdit}
                  onDelete={() => onDelete(review)}
                />
              ) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Review Card ─── */

function ReviewCard({
  href,
  name,
  image,
  rating,
  comment,
  date,
  label,
  menu,
}: {
  href: string;
  name: string;
  image: string | null;
  rating: number;
  comment?: string | null;
  date: Date;
  label?: string;
  menu?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="relative w-[300px] shrink-0 rounded-2xl border border-border/50 bg-card p-4 transition-colors hover:border-border/80 sm:w-[340px]">
      <Link href={href} className="absolute inset-0 z-0 rounded-2xl" />
      <div className="relative z-10 flex items-start justify-between gap-2">
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
              {new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-lg bg-yellow-500/10 px-2 py-1 text-sm font-bold text-yellow-500">
            {rating}
            <Star size={12} className="fill-current" />
          </span>
          {menu}
        </div>
      </div>
      {label && (
        <div className="relative z-10 mt-2.5">
          <span className="rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {label}
          </span>
        </div>
      )}
      {comment && (
        <p className="relative z-10 mt-2.5 line-clamp-3 text-sm leading-relaxed text-foreground/70">{comment}</p>
      )}
    </div>
  );
}

/* ─── Review Menu ─── */

function ReviewMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="relative z-20 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground">
          <MoreHorizontal size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="relative z-30 w-36 p-1">
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-muted" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </button>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-400 hover:bg-muted" onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </button>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Review Form ─── */

function ReviewForm({
  mediaId,
  onSuccess,
  onCancel,
}: {
  mediaId: string;
  onSuccess: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { data: userRatings } = trpc.userMedia.getRatings.useQuery({ mediaId });
  const userRating = useMemo(
    () => userRatings?.find((r) => !r.seasonId && !r.episodeId),
    [userRatings],
  );

  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(userRating?.rating ?? null);
  const [comment, setComment] = useState(userRating?.comment ?? "");

  useEffect(() => { setSelectedRating(userRating?.rating ?? null); }, [userRating?.rating]);
  useEffect(() => { setComment(userRating?.comment ?? ""); }, [userRating?.comment]);

  const rateMutation = trpc.userMedia.rate.useMutation({
    onSuccess: () => { onSuccess(); toast.success("Review saved"); },
    onError: (err) => toast.error(err.message),
  });

  const displayRating = hoverRating ?? selectedRating ?? 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => {
          const value = i + 1;
          return (
            <button
              key={value}
              type="button"
              className="group p-0.5 transition-transform hover:scale-110 active:scale-95"
              onMouseEnter={() => setHoverRating(value)}
              onMouseLeave={() => setHoverRating(null)}
              onClick={() => setSelectedRating(value)}
            >
              <Star className={cn("h-5 w-5 transition-colors", value <= displayRating ? "fill-yellow-500 text-yellow-500" : "text-foreground/15 group-hover:text-foreground/30")} />
            </button>
          );
        })}
        {selectedRating && selectedRating > 0 && (
          <span className="ml-2 text-sm font-medium text-muted-foreground">{selectedRating}/10</span>
        )}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your thoughts..."
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border-0 bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
      />
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => { if (selectedRating) rateMutation.mutate({ mediaId, rating: selectedRating, comment: comment.trim() || undefined }); }}
          disabled={rateMutation.isPending || !selectedRating}
        >
          {rateMutation.isPending ? "Saving..." : userRating ? "Update" : "Post Review"}
        </Button>
      </div>
    </div>
  );
}
