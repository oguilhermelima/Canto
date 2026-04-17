"use client";

import { LibraryCarousel } from "~/app/(app)/library/_components/library-carousel";
import { useSectionInfiniteQuery } from "~/components/home/sources/use-section-query";
import { UpcomingScheduleCard } from "~/components/media/cards/upcoming-schedule-card";
import type { UpcomingScheduleItem } from "~/components/media/cards/upcoming-schedule-card";
import { trpc } from "~/lib/trpc/client";

export { UpcomingScheduleCard } from "~/components/media/cards/upcoming-schedule-card";
export type { UpcomingScheduleItem } from "~/components/media/cards/upcoming-schedule-card";

const PAGE_SIZE = 72;
const CARD_WIDTH_CLASS = "w-[280px] sm:w-[300px] lg:w-[340px] 2xl:w-[380px]";

export function UpcomingScheduleSection(): React.JSX.Element {
  return (
    <UpcomingScheduleSectionContent
      title="Upcoming Schedule"
      seeAllHref="/library/upcoming"
    />
  );
}

export function UpcomingScheduleSectionContent({
  title,
  seeAllHref,
}: {
  title: string;
  seeAllHref?: string;
}): React.JSX.Element {
  const query = trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const { items, isLoading, isError, isFetchingMore, onLoadMore, onRetry } =
    useSectionInfiniteQuery(
      query,
      (page) => page.items,
      (raw): UpcomingScheduleItem => raw as UpcomingScheduleItem,
    );

  return (
    <LibraryCarousel<UpcomingScheduleItem>
      title={title}
      seeAllHref={seeAllHref}
      items={items}
      isLoading={isLoading}
      isError={isError}
      isFetchingMore={isFetchingMore}
      onLoadMore={onLoadMore}
      onRetry={onRetry}
      emptyPreset="emptyUpcoming"
      renderCard={(item) => (
        <UpcomingScheduleCard key={item.id} item={item} />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-video"
    />
  );
}
