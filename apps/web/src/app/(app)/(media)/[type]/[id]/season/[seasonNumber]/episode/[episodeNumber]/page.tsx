"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Clock, MessageSquareText, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { FadeImage } from "~/components/ui/fade-image";
import { tmdbBackdropLoader } from "~/lib/tmdb-image";
import { TitleBar } from "~/components/layout/titlebar";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { toast } from "sonner";

export default function EpisodeDetailPage(): React.JSX.Element {
  const params = useParams<{
    type: string;
    id: string;
    seasonNumber: string;
    episodeNumber: string;
  }>();
  const router = useRouter();

  if (params.type !== "shows") notFound();

  const seasonNum = parseInt(params.seasonNumber, 10);
  const episodeNum = parseInt(params.episodeNumber, 10);

  const { data: resolvedData, isLoading } = trpc.media.resolve.useQuery({
    externalId: parseInt(params.id, 10),
    type: "show",
    provider: "tmdb",
  });

  const media = resolvedData?.media;
  const mediaId = (resolvedData as { mediaId?: string } | undefined)?.mediaId;

  const season = useMemo(
    () => media?.seasons?.find((s: { number: number }) => s.number === seasonNum),
    [media?.seasons, seasonNum],
  );

  const episode = useMemo(
    () => season?.episodes?.find((e: { number: number }) => e.number === episodeNum),
    [season?.episodes, episodeNum],
  );

  useDocumentTitle(
    episode?.title
      ? `${episode.title} — ${media?.title ?? "Show"}`
      : undefined,
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TitleBar title="" />
        <div className="relative -mt-16 min-h-[55vh] w-full bg-gradient-to-b from-muted/20 to-background max-md:mt-0 max-md:min-h-0">
          <Skeleton className="absolute inset-0 max-md:relative max-md:aspect-video" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 via-30% to-transparent max-md:hidden" />
          <div className="relative mx-auto flex min-h-[55vh] w-full flex-col justify-end px-4 pb-10 pt-24 max-md:hidden md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-10 w-96 max-w-full" />
            <Skeleton className="mt-3 h-5 w-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!media || !season || !episode) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="mb-2 text-base font-semibold text-foreground md:text-xl">
            Episode not found
          </h2>
          <p className="text-sm text-muted-foreground">
            The episode you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/shows/${params.id}`)}
          >
            Back to show
          </Button>
        </div>
      </div>
    );
  }

  const sNum = String(seasonNum).padStart(2, "0");
  const eNum = String(episodeNum).padStart(2, "0");
  const stillSrc = episode.stillPath ?? null;

  const prevEpisode = season.episodes?.find(
    (e: { number: number }) => e.number === episodeNum - 1,
  );
  const nextEpisode = season.episodes?.find(
    (e: { number: number }) => e.number === episodeNum + 1,
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile topbar */}
      <TitleBar
        title={media.title}
        onNavigate={() => router.push(`/shows/${params.id}`)}
      />

      {/* Hero — full-width still image (desktop) */}
      <div className="relative -mt-16 w-full overflow-hidden max-md:mt-0">
        {/* Desktop hero */}
        {stillSrc ? (
          <>
            <div className="absolute inset-x-0 top-0 h-[80vh] overflow-hidden max-md:hidden">
              <FadeImage
                loader={tmdbBackdropLoader}
                src={stillSrc}
                alt=""
                fill
                className="object-cover object-top"
                fadeDuration={700}
                priority
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background from-0% via-background/40 via-40% to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />
            </div>
            {/* Extra gradient that bleeds below the image for seamless transition */}
            <div className="absolute inset-x-0 top-[65vh] h-[20vh] bg-gradient-to-b from-transparent to-background max-md:hidden" />
          </>
        ) : (
          <div className="absolute inset-x-0 top-0 h-[80vh] bg-gradient-to-b from-muted/30 to-background max-md:hidden" />
        )}

        {/* Mobile still image */}
        {stillSrc && (
          <div className="relative aspect-video w-full overflow-hidden bg-muted md:hidden">
            <FadeImage
              loader={tmdbBackdropLoader}
              src={stillSrc}
              alt=""
              fill
              className="object-cover"
              fadeDuration={500}
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>
        )}

        {/* Desktop content over hero */}
        <div className="relative mx-auto hidden min-h-[55vh] w-full flex-col justify-end px-4 pb-10 pt-24 md:flex md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          {/* Back link */}
          <Link
            href={`/shows/${params.id}`}
            className="mb-6 inline-flex w-fit items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft size={18} />
            {media.title}
          </Link>

          <EpisodeInfo episode={episode} sNum={sNum} eNum={eNum} seasonNum={seasonNum} variant="hero" />
        </div>
      </div>

      {/* Mobile info */}
      <div className="px-4 pt-5 md:hidden">
        <EpisodeInfo episode={episode} sNum={sNum} eNum={eNum} seasonNum={seasonNum} variant="body" />
      </div>

      {/* Body content */}
      <div className="px-4 pb-12 pt-6 md:px-8 md:pt-0 lg:px-12 xl:px-16 2xl:px-24">
        {/* Overview */}
        {episode.overview && (
          <p className="max-w-3xl leading-relaxed text-muted-foreground">
            {episode.overview}
          </p>
        )}

        {/* Guest Stars */}
        {(episode as any).guestStars?.length > 0 && (
          <EpisodeCreditsSection title="Guest Stars" people={(episode as any).guestStars} showCharacter />
        )}

        {/* Crew */}
        {(episode as any).crew?.length > 0 && (
          <EpisodeCreditsSection title="Crew" people={(episode as any).crew} />
        )}

        {/* Your Review + Community Reviews */}
        {episode.id && mediaId && season?.id && (
          <EpisodeReviewsSection
            episodeId={episode.id}
            mediaId={mediaId}
            seasonId={season.id}
            showExternalId={params.id}
          />
        )}

        {/* Prev / Next navigation */}
        <div className="mt-10 flex items-center justify-between border-t border-border/30 pt-6">
          {prevEpisode ? (
            <Link
              href={`/shows/${params.id}/season/${seasonNum}/episode/${prevEpisode.number}`}
              className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft size={16} className="text-muted-foreground/50 transition-colors group-hover:text-foreground" />
              <div>
                <span className="text-xs text-muted-foreground/50">Previous</span>
                <p className="mt-0.5 font-medium text-foreground">
                  E{String(prevEpisode.number).padStart(2, "0")} — {prevEpisode.title || `Episode ${prevEpisode.number}`}
                </p>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextEpisode ? (
            <Link
              href={`/shows/${params.id}/season/${seasonNum}/episode/${nextEpisode.number}`}
              className="group flex items-center gap-2 text-right text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <div>
                <span className="text-xs text-muted-foreground/50">Next</span>
                <p className="mt-0.5 font-medium text-foreground">
                  E{String(nextEpisode.number).padStart(2, "0")} — {nextEpisode.title || `Episode ${nextEpisode.number}`}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground/50 transition-colors group-hover:text-foreground" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Episode Info (shared between hero and mobile) ─── */

function EpisodeInfo({
  episode,
  sNum,
  eNum,
  seasonNum,
  variant,
}: {
  episode: { title: string | null; airDate?: string | null; runtime?: number | null; voteAverage?: number | null; number: number; finaleType?: string | null; episodeType?: string | null };
  sNum: string;
  eNum: string;
  seasonNum: number;
  variant: "hero" | "body";
}): React.JSX.Element {
  const isHero = variant === "hero";
  return (
    <>
      <div className={`flex items-center gap-2 text-sm ${isHero ? "text-white/70" : "text-muted-foreground"}`}>
        <span className={`font-semibold ${isHero ? "text-white" : "text-foreground"}`}>
          S{sNum}E{eNum}
        </span>
        <span className={isHero ? "text-white/40" : "text-muted-foreground"}>|</span>
        <span>Season {seasonNum}</span>
      </div>

      <h1 className={`mt-2 max-w-3xl text-2xl font-bold tracking-tight ${isHero ? "text-white md:text-4xl" : "text-foreground"}`}>
        {episode.title || `Episode ${episode.number}`}
      </h1>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-sm ${isHero ? "text-white/70" : "text-muted-foreground"}`}>
        {episode.airDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={14} />
            {new Date(episode.airDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        )}
        {episode.runtime != null && episode.runtime > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock size={14} />
            {episode.runtime}min
          </div>
        )}
        {episode.voteAverage != null && episode.voteAverage > 0 && (
          <div className="flex items-center gap-1.5" title="TMDB rating">
            <Star size={14} className="fill-yellow-500 text-yellow-500" />
            <span>{episode.voteAverage.toFixed(1)}</span>
            <span className={isHero ? "text-white/40" : "text-muted-foreground/50"}>TMDB</span>
          </div>
        )}
        {(episode.finaleType === "series" || episode.finaleType === "season" || episode.episodeType === "finale") && (
          <span className="rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-bold text-black">
            {episode.finaleType === "series" ? "Series Finale" : "Finale"}
          </span>
        )}
      </div>
    </>
  );
}

/* ─── Episode Reviews Section ─── */

function EpisodeReviewsSection({
  episodeId,
  mediaId,
  seasonId,
  showExternalId,
}: {
  episodeId: string;
  mediaId: string;
  seasonId: string;
  showExternalId: string;
}): React.JSX.Element {
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

  const reviews = reviewsData?.reviews ?? [];
  const total = reviewsData?.total ?? 0;
  const otherReviews = useMemo(
    () => reviews.filter((r) => r.user.id !== session?.user?.id),
    [reviews, session?.user?.id],
  );
  const hasMore = total > 12;

  const invalidateAll = () => {
    void utils.userMedia.getRatings.invalidate({ mediaId });
    void utils.userMedia.getMediaReviews.invalidate();
  };

  const hasReview = !!userEpisodeRating;
  const allReviewsHref = `/shows/${showExternalId}/reviews`;

  return (
    <div className="mt-12">
      {/* Your Review */}
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
        <ReviewCardStyled
          name={session?.user?.name ?? "You"}
          image={session?.user?.image ?? null}
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
        <div className="rounded-2xl border border-border/30 bg-card/50 p-4">
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

      {/* Community Reviews */}
      {(isLoading || otherReviews.length > 0) && (
        <div className="mt-8">
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
            Community
            {otherReviews.length > 0 && (
              <span className="ml-1.5 text-muted-foreground/50">{otherReviews.length}</span>
            )}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border/30 bg-card/50 p-4">
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
                  <ReviewCardStyled
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

/* ─── Delete Button ─── */

function DeleteReviewButton({
  mediaId,
  episodeId,
  onDelete,
}: {
  mediaId: string;
  episodeId: string;
  onDelete: () => void;
}): React.JSX.Element {
  const deleteMutation = trpc.userMedia.removeRating.useMutation({
    onSuccess: () => { onDelete(); toast.success("Review deleted"); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-400 hover:bg-muted"
      onClick={() => deleteMutation.mutate({ mediaId, episodeId })}
      disabled={deleteMutation.isPending}
    >
      <Trash2 size={14} />
      Delete
    </button>
  );
}

/* ─── Rating Form ─── */

function EpisodeRatingForm({
  mediaId,
  seasonId,
  episodeId,
  initialRating,
  initialComment,
  onSuccess,
  onCancel,
}: {
  mediaId: string;
  seasonId: string;
  episodeId: string;
  initialRating: number | null;
  initialComment: string | null;
  onSuccess: () => void;
  onCancel?: () => void;
}): React.JSX.Element {
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
      {/* Stars */}
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
                    : "text-foreground/15 group-hover:text-foreground/30",
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

      {/* Comment */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your thoughts on this episode..."
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border-0 bg-background/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
      />

      {/* Actions */}
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

/* ─── Review Card (Letterboxd-style) ─── */

function ReviewCardStyled({
  name,
  image,
  rating,
  comment,
  date,
  menu,
}: {
  name: string;
  image: string | null;
  rating: number;
  comment?: string | null;
  date: Date;
  menu?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border/30 bg-card/50 p-4">
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

/* ─── Episode Credits Section (Crew / Guest Stars) ─── */

function EpisodeCreditsSection({
  title,
  people,
  showCharacter,
}: {
  title: string;
  people: Array<{ name: string; job?: string; character?: string; department?: string; profilePath?: string | null }>;
  showCharacter?: boolean;
}): React.JSX.Element {
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-lg font-bold">{title}</h3>
      <div className="flex flex-wrap gap-3">
        {people.map((person, i) => (
          <div
            key={`${person.name}-${i}`}
            className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2"
          >
            {person.profilePath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w92${person.profilePath}`}
                alt={person.name}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {person.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{person.name}</p>
              <p className="text-xs text-muted-foreground">
                {showCharacter ? person.character : person.job}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
