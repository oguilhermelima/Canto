"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Film, Loader2, Tv } from "lucide-react";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import type { TabItem } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";
import { FilterSidebar } from "~/components/media/filter-sidebar";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { trpc } from "~/lib/trpc/client";
import { mediaHref } from "~/lib/media-href";
import { useLogo } from "~/hooks/use-logos";
import { MediaLogo } from "~/components/media/media-logo";
import { cn } from "@canto/ui/cn";

const PAGE_SIZE = 24;
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface UpcomingItem {
  id: string;
  kind: string;
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  fromLists: string[];
  releaseAt: Date | string;
  episode: {
    id: string;
    seasonNumber: number;
    number: number;
    title: string | null;
  } | null;
}

function imageUrl(item: UpcomingItem): string | null {
  const path = item.backdropPath ?? item.posterPath;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE_BASE}/w780${path}`;
}

function formatReleaseLabel(value: Date): string {
  if (Number.isNaN(value.getTime())) return "Soon";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfRelease = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const diffDays = Math.round((startOfRelease.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

function UpcomingCard({ item }: { item: UpcomingItem }): React.JSX.Element {
  const releaseDate = new Date(item.releaseAt);
  const releaseLabel = formatReleaseLabel(releaseDate);
  const episodeLabel = item.episode
    ? `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}${item.episode.title ? ` · ${item.episode.title}` : ""}`
    : "Movie release";

  const cardImage = imageUrl(item);
  const logoPath = useLogo(item.provider, String(item.externalId), item.mediaType, {
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    year: item.year,
  });

  return (
    <Link
      href={mediaHref(item.provider, item.externalId, item.mediaType)}
      className="group relative flex overflow-hidden rounded-xl transition-all duration-300 hover:z-10 hover:scale-[1.02] hover:ring-2 hover:ring-foreground/20"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {cardImage ? (
          <Image
            src={cardImage}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            {item.mediaType === "show" ? <Tv className="h-10 w-10" /> : <Bookmark className="h-10 w-10" />}
          </div>
        )}

        <div className="absolute right-2.5 top-2.5 rounded-sm bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          {releaseLabel}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-14">
          {logoPath ? (
            <MediaLogo
              src={`${TMDB_IMAGE_BASE}/w500${logoPath}`}
              alt={item.title}
              size="card"
              className="max-w-[70%]"
            />
          ) : (
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
              {item.title}
            </p>
          )}
          <p className={cn("line-clamp-2 text-xs text-white/80", logoPath ? "mt-2" : "mt-1")}>
            {episodeLabel}
          </p>
          <p className="mt-1 text-[11px] text-white/70">
            {releaseDate.toLocaleDateString(undefined, { dateStyle: "medium" })}
          </p>
        </div>
      </div>
    </Link>
  );
}

const TYPE_TABS: TabItem[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

export default function UpcomingSchedulePage(): React.JSX.Element {
  useDocumentTitle("Upcoming Schedule");

  const [mediaType, setMediaType] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
      { limit: PAGE_SIZE },
      { getNextPageParam: (lp) => lp.nextCursor, initialCursor: 0 },
    );

  const allItems = useMemo(
    () => (data?.pages.flatMap((p) => p.items) ?? []) as UpcomingItem[],
    [data],
  );

  const items = useMemo(
    () => mediaType === "all" ? allItems : allItems.filter((i) => i.mediaType === mediaType),
    [allItems, mediaType],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) handleFetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleFetchNextPage]);

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Upcoming Schedule"
        subtitle="New episodes and releases on the horizon."
      />
      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div
          className={cn(
            "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
            showFilters ? "mr-4 opacity-100 lg:mr-8" : "-ml-[20rem] mr-0 opacity-0",
          )}
        >
          <FilterSidebar
            mediaType={mediaType as "all" | "movie" | "show"}
            onFilterChange={() => {}}
          />
        </div>

        <div className="min-w-0 flex-1">
          <TabBar
            tabs={TYPE_TABS}
            value={mediaType}
            onChange={setMediaType}
            onFilter={() => setShowFilters(!showFilters)}
            filterActive={showFilters}
          />

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : isError ? (
            <StateMessage preset="error" onRetry={() => void refetch()} />
          ) : items.length === 0 ? (
            <StateMessage preset="emptyUpcoming" />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <UpcomingCard key={item.id} item={item} />
                ))}
              </div>

              <div ref={sentinelRef} className="h-1" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!hasNextPage && !isFetchingNextPage && items.length > 0 && (
                <StateMessage preset="endOfItems" inline />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
