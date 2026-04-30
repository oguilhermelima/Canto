"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useSectionInfiniteQuery } from "@/components/home/sources/use-section-query";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import { WatchNextCard } from "@/components/media/cards/watch-next-card";
import type {
  WatchNextItem,
  WatchNextView,
} from "@/components/media/cards/watch-next-card";
import { LibraryCarousel } from "./library-carousel";

export { WatchNextCard } from "@/components/media/cards/watch-next-card";
export type { WatchNextItem, WatchNextView } from "@/components/media/cards/watch-next-card";

const CARD_WIDTH_CLASS = "w-[220px] sm:w-[280px] lg:w-[340px] 2xl:w-[380px]";

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
  const initialLimit = useResponsivePageSize({ mobile: 6, tablet: 10, desktop: 15 });
  const [limit] = useState(initialLimit);

  const continueQuery = trpc.userMedia.getContinueWatching.useInfiniteQuery(
    { limit, mediaType },
    {
      enabled: isContinue,
      getNextPageParam: (lp) => lp.nextCursor ?? undefined,
      initialCursor: null,
    },
  );
  const watchNextQuery = trpc.userMedia.getWatchNext.useInfiniteQuery(
    { limit, mediaType },
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
