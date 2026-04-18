"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import type { SpaceStateKey } from "@canto/ui/presets/space-states";
import { MediaCard } from "~/components/media/media-card";
import { RatingBadgeStack } from "~/components/media/rating-badge";
import { trpc } from "~/lib/trpc/client";
import { LibraryCarousel } from "./library-carousel";

const PAGE_SIZE = 24;
const CARD_WIDTH_CLASS = "w-[180px] shrink-0 sm:w-[200px] lg:w-[220px] 2xl:w-[240px]";

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
  const query = trpc.userMedia.getUserMedia.useInfiniteQuery(
    { ...queryInput, limit: PAGE_SIZE },
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
          className={CARD_WIDTH_CLASS}
          hideMetaRating
          slots={{
            topLeft: (
              <RatingBadgeStack
                voteAverage={item.voteAverage}
                userRating={showUserRating ? item.rating : null}
              />
            ),
          }}
        />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-[2/3]"
    />
  );
}
