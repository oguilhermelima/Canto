"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownUp, ChevronDown, Star } from "lucide-react";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import { StateMessage } from "@canto/ui/state-message";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { PageHeader } from "@/components/page-header";
import { TabBar } from "@canto/ui/tab-bar";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

const PAGE_SIZE = 20;

const typeMap: Record<string, "movie" | "show"> = {
  movies: "movie",
  shows: "show",
};

const SCOPE_TABS = [
  { value: "all", label: "All" },
  { value: "series", label: "Series" },
  { value: "episode", label: "Episode" },
];

export default function ReviewsPage(): React.JSX.Element {
  const params = useParams<{ type: string; id: string }>();
  const router = useRouter();
  const mediaType = typeMap[params.type];
  if (!mediaType) notFound();

  const [scopeFilter, setScopeFilter] = useState("all");
  const [episodeFilter, setEpisodeFilter] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"date" | "rating">("date");

  const { data: resolvedData } = trpc.media.resolve.useQuery({
    externalId: parseInt(params.id, 10),
    type: mediaType,
    provider: "tmdb",
  });

  const media = resolvedData?.media;
  const mediaId = resolvedData?.mediaId;

  useDocumentTitle(media?.title ? `Reviews — ${media.title}` : undefined);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data, isLoading } = trpc.userMedia.getMediaReviews.useQuery(
    {
      mediaId: mediaId ?? "",
      limit: 100,
      episodeId: scopeFilter === "episode" && episodeFilter ? episodeFilter : undefined,
      sortBy,
    },
    { enabled: !!mediaId },
  );

  // Client-side scope filter
  const allReviews = useMemo(() => {
    const raw = data?.reviews ?? [];
    if (scopeFilter === "series") return raw.filter((r) => !r.seasonId && !r.episodeId);
    if (scopeFilter === "episode" && !episodeFilter) return raw.filter((r) => !!r.episodeId);
    return raw;
  }, [data?.reviews, scopeFilter, episodeFilter]);

  const total = allReviews.length;
  const reviews = allReviews.slice(0, visibleCount);
  const hasNextPage = visibleCount < allReviews.length;

  // Rating distribution
  const ratingDistribution = useMemo(() => {
    const dist = Array.from({ length: 10 }, () => 0);
    for (const r of allReviews) {
      const idx = r.rating - 1;
      if (idx >= 0 && idx < dist.length) {
        dist[idx] = (dist[idx] ?? 0) + 1;
      }
    }
    return dist;
  }, [allReviews]);
  const maxCount = Math.max(...ratingDistribution, 1);

  // Episode options
  const episodes = useMemo(() => {
    if (mediaType !== "show" || !media?.seasons) return [];
    const eps: { id: string; label: string }[] = [];
    for (const s of media.seasons as Array<{ number: number; episodes?: Array<{ id: string; number: number; title?: string | null }> }>) {
      for (const e of s.episodes ?? []) {
        eps.push({
          id: e.id,
          label: `S${String(s.number).padStart(2, "0")}E${String(e.number).padStart(2, "0")}${e.title ? ` — ${e.title}` : ""}`,
        });
      }
    }
    return eps;
  }, [media, mediaType]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [scopeFilter, episodeFilter, sortBy]);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const handleFetchNext = useCallback(() => {
    setVisibleCount((c) => c + PAGE_SIZE);
  }, []);

  const sentinelRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage: false,
    onFetchNextPage: handleFetchNext,
    rootMargin: "300px",
  });

  const backHref = `/${params.type}/${params.id}`;

  function reviewLabel(r: { seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; seasonId: string | null; episodeId: string | null }): string {
    if (r.episodeNumber !== null) {
      const tag = `S${String(r.seasonNumber ?? 0).padStart(2, "0")}E${String(r.episodeNumber).padStart(2, "0")}`;
      return r.episodeTitle ? `${tag} · ${r.episodeTitle}` : tag;
    }
    if (r.seasonId && !r.episodeId) return `Season ${r.seasonNumber ?? "?"}`;
    return mediaType === "show" ? "Series" : "Movie";
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Reviews"
        onNavigate={() => router.push(backHref)}
      />

      <div className="px-4 md:pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Scope tabs */}
          {mediaType === "show" && (
            <TabBar
              tabs={SCOPE_TABS}
              value={scopeFilter}
              onChange={(v) => { setScopeFilter(v); if (v !== "episode") setEpisodeFilter(undefined); }}
              className="mb-0 py-0"
            />
          )}

          {/* Episode dropdown */}
          {scopeFilter === "episode" && episodes.length > 0 && (
            <select
              value={episodeFilter ?? ""}
              onChange={(e) => setEpisodeFilter(e.target.value || undefined)}
              className="max-w-[300px] truncate rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
            >
              <option value="">All episodes</option>
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.label}</option>
              ))}
            </select>
          )}

          <div className="flex-1" />

          {/* Sort dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowDownUp size={14} />
                {sortBy === "date" ? "Recent" : "Top rated"}
                <ChevronDown size={14} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
              <button type="button" className={cn("flex w-full items-center rounded-lg px-3 py-2 text-sm", sortBy === "date" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")} onClick={() => setSortBy("date")}>Recent</button>
              <button type="button" className={cn("flex w-full items-center rounded-lg px-3 py-2 text-sm", sortBy === "rating" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")} onClick={() => setSortBy("rating")}>Top rated</button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Rating distribution chart */}
        {total > 0 && (
          <div className="mt-6 flex items-end gap-1.5">
            {ratingDistribution.map((count, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="w-7 rounded-t-md bg-yellow-500/80 transition-all"
                  style={{ height: `${Math.max((count / maxCount) * 60, 2)}px` }}
                />
                <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              </div>
            ))}
            <Star size={12} className="mb-0.5 ml-1 fill-yellow-500 text-yellow-500" />
          </div>
        )}

        {/* Reviews list */}
        <div className="mt-6 space-y-3">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                </div>
              ))
            : reviews.length > 0
              ? reviews.map((review) => (
                  <ExpandableReviewCard
                    key={review.id}
                    review={review}
                    label={reviewLabel(review)}
                    href={`/${params.type}/${params.id}/reviews/${review.id}`}
                  />
                ))
              : (
                  <StateMessage
                    preset="emptyReviews"
                    minHeight="200px"
                  />
                )}

          {hasNextPage && <div ref={sentinelRef} className="h-4" />}
        </div>
      </div>
    </div>
  );
}

/* ─── Expandable Review Card ─── */

function ExpandableReviewCard({
  review,
  label,
  href,
}: {
  review: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    user: { id: string; name: string | null; image: string | null };
  };
  label: string;
  href: string;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasLongComment = (review.comment?.length ?? 0) > 200;

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
            {review.user.image ? (
              <Image src={review.user.image} alt={review.user.name ?? ""} width={40} height={40} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {(review.user.name ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{review.user.name ?? "Anonymous"}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-yellow-500/10 px-2 py-1 text-sm font-bold text-yellow-500">
          {review.rating}
          <Star size={12} className="fill-current" />
        </span>
      </div>
      <div className="mt-2.5">
        <span className="rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      {review.comment && (
        <div className="mt-2.5">
          <p className={cn(
            "text-sm leading-relaxed text-foreground",
            !expanded && "line-clamp-3",
          )}>
            {review.comment}
          </p>
          {hasLongComment && !expanded && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={(e) => { e.preventDefault(); setExpanded(true); }}
            >
              Show more
            </button>
          )}
        </div>
      )}
    </Link>
  );
}
