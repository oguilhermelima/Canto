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

const PAGE_SIZE = 72;
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
  const query = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit: PAGE_SIZE, view, mediaType },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const { items, isLoading, isError, isFetchingMore, onLoadMore, onRetry } =
    useSectionInfiniteQuery(
      query,
      (page) => page.items,
      (raw): WatchNextItem => raw as WatchNextItem,
    );

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
      emptyPreset={view === "continue" ? "emptyContinueWatching" : "emptyWatchNext"}
      renderCard={(item) => (
        <WatchNextCard key={item.id} item={item} view={view} />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-video"
    />
  );
}
