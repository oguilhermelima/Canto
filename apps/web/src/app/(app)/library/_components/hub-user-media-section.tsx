"use client";

import { useMemo, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import type { SpaceStateKey } from "@canto/ui/presets/space-states";
import { MediaCard } from "@/components/media/media-card";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import { trpc } from "@/lib/trpc/client";
import { LibraryCarousel } from "./library-carousel";

const CARD_WIDTH_CLASS = "w-[140px] shrink-0 sm:w-[180px] lg:w-[220px] 2xl:w-[240px]";

type GetUserMediaInput = Parameters<
  typeof trpc.userMedia.getUserMedia.useInfiniteQuery
>[0];

interface HubUserMediaSectionProps {
  title: string;
  icon?: LucideIcon;
  seeAllHref: string;
  emptyPreset: SpaceStateKey;
  queryInput: Omit<GetUserMediaInput, "limit" | "cursor">;
  showUserRating?: boolean;
}

export function HubUserMediaSection({
  title,
  icon,
  seeAllHref,
  emptyPreset,
  queryInput,
  showUserRating = false,
}: HubUserMediaSectionProps): React.JSX.Element {
  const initialLimit = useResponsivePageSize({ mobile: 6, tablet: 10, desktop: 15 });
  const lockedRef = useRef(initialLimit);
  const limit = lockedRef.current;
  const query = trpc.userMedia.getUserMedia.useInfiniteQuery(
    { ...queryInput, limit },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return (
    <LibraryCarousel
      title={title}
      icon={icon}
      seeAllHref={seeAllHref}
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      isFetchingMore={query.isFetchingNextPage}
      onLoadMore={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
      onRetry={() => void query.refetch()}
      emptyPreset={emptyPreset}
      renderCard={(item) => (
        <MediaCard
          key={item.mediaId}
          id={item.mediaId}
          externalId={item.externalId}
          provider={item.provider}
          type={item.mediaType as "movie" | "show"}
          title={item.title}
          posterPath={item.posterPath}
          year={item.year}
          voteAverage={item.voteAverage}
          userRating={showUserRating ? item.rating : null}
          className={CARD_WIDTH_CLASS}
        />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-[2/3]"
    />
  );
}
