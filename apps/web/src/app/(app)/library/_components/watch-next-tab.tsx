"use client";

import type { LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useSectionInfiniteQuery } from "@/components/home/sources/use-section-query";
import { WatchNextCard } from "@/components/media/cards/watch-next-card";
import type {
  WatchNextItem,
  WatchNextView,
} from "@/components/media/cards/watch-next-card";
import { LibraryCarousel } from "./library-carousel";

export { WatchNextCard } from "@/components/media/cards/watch-next-card";
export type { WatchNextItem, WatchNextView } from "@/components/media/cards/watch-next-card";

// Page size dropped from 72 → 24. The backend now applies LIMIT in SQL, so
// asking for 72 just to render 24 above the fold was pure waste.
const PAGE_SIZE = 24;
const CARD_WIDTH_CLASS = "w-[280px] sm:w-[300px] lg:w-[340px] 2xl:w-[380px]";

export function WatchNextTab({
  view = "watch_next",
  title = "Watch Next",
  icon,
  seeAllHref,
  mediaType,
}: {
  view?: WatchNextView;
  title?: string;
  icon?: LucideIcon;
  seeAllHref?: string;
  mediaType?: "movie" | "show";
}): React.JSX.Element {
  const isContinue = view === "continue";

  const continueQuery = trpc.userMedia.getContinueWatching.useInfiniteQuery(
    { limit: PAGE_SIZE, mediaType },
    {
      enabled: isContinue,
      getNextPageParam: (lp) => lp.nextCursor ?? undefined,
      initialCursor: null,
    },
  );
  const watchNextQuery = trpc.userMedia.getWatchNext.useInfiniteQuery(
    { limit: PAGE_SIZE, mediaType },
    {
      enabled: !isContinue,
      getNextPageParam: (lp) => lp.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  const continueResult = useSectionInfiniteQuery(
    continueQuery,
    (page) => page.items,
    (raw): WatchNextItem => raw as unknown as WatchNextItem,
  );
  const watchNextResult = useSectionInfiniteQuery(
    watchNextQuery,
    (page) => page.items,
    (raw): WatchNextItem => raw as unknown as WatchNextItem,
  );

  const { items, isLoading, isError, isFetchingMore, onLoadMore, onRetry } =
    isContinue ? continueResult : watchNextResult;

  return (
    <LibraryCarousel<WatchNextItem>
      title={title}
      icon={icon}
      seeAllHref={seeAllHref}
      items={items}
      isLoading={isLoading}
      isError={isError}
      isFetchingMore={isFetchingMore}
      onLoadMore={onLoadMore}
      onRetry={onRetry}
      emptyPreset={isContinue ? "emptyContinueWatching" : "emptyWatchNext"}
      renderCard={(item) => (
        <WatchNextCard key={item.id} item={item} view={view} />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-video"
    />
  );
}
