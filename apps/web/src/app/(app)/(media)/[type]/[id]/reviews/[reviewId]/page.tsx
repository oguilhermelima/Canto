"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Star } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";

const typeMap: Record<string, "movie" | "show"> = {
  movies: "movie",
  shows: "show",
};

export default function ReviewDetailPage(): React.JSX.Element {
  const params = useParams<{ type: string; id: string; reviewId: string }>();
  const router = useRouter();
  const mediaType = typeMap[params.type];
  if (!mediaType) notFound();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const { data: review, isLoading } = trpc.userMedia.getReviewById.useQuery({
    reviewId: params.reviewId,
  });

  const backHref = `/${params.type}/${params.id}/reviews`;

  useDocumentTitle(
    review?.user.name ? `Review by ${review.user.name}` : undefined,
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Review" onNavigate={() => router.push(backHref)} />
        <div className="px-4 md:pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="mt-6 h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-base font-semibold">Review not found</h2>
          <Button variant="outline" className="mt-4" onClick={() => router.push(backHref)}>
            Back to reviews
          </Button>
        </div>
      </div>
    );
  }

  const label = review.episodeNumber != null
    ? `S${String(review.seasonNumber ?? 0).padStart(2, "0")}E${String(review.episodeNumber).padStart(2, "0")}${review.episodeTitle ? ` · ${review.episodeTitle}` : ""}`
    : review.seasonId && !review.episodeId
      ? `Season ${review.seasonNumber ?? "?"}`
      : mediaType === "show" ? "Series" : "Movie";

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Review" onNavigate={() => router.push(backHref)} />

      <div className="px-4 md:pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
              {review.user.image ? (
                <Image src={review.user.image} alt={review.user.name ?? ""} width={56} height={56} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
                  {(review.user.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{review.user.name ?? "Anonymous"}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>

          <span className="flex items-center gap-1.5 rounded-xl bg-yellow-500/10 px-3 py-1.5 text-base font-bold text-yellow-500">
            {review.rating}
            <Star size={16} className="fill-current" />
          </span>
        </div>

        {/* Label */}
        <div className="mt-4">
          <span className="rounded-lg bg-muted/80 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {label}
          </span>
        </div>

        {/* Comment — full, no clamp */}
        {review.comment ? (
          <p className="mt-5 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {review.comment}
          </p>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            No written review.
          </p>
        )}
      </div>
    </div>
  );
}
