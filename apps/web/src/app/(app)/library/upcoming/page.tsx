"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { BrowseLayout } from "@/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "@/components/layout/browse-layout";
import { progressStrategy } from "@/components/layout/card-strategies";
import { PageHeader } from "@/components/page-header";
import { StateMessage } from "@canto/ui/state-message";
import { TabBar } from "@canto/ui/tab-bar";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useViewMode } from "@/hooks/use-view-mode";
import { trpc } from "@/lib/trpc/client";
import type { UpcomingScheduleItem } from "@/components/media/cards/upcoming-schedule-card";
import { UpcomingCalendarMonth } from "./_components/upcoming-calendar-month";

const PAGE_SIZE = 100;

const VIEW_TABS = [
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "browse", label: "Browse", icon: LayoutGrid },
] as const;

type ViewKey = (typeof VIEW_TABS)[number]["value"];

const OUTER_PADDING = "px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24";

export default function UpcomingSchedulePage(): React.JSX.Element {
  useDocumentTitle("Upcoming Schedule");

  const [view, setView] = useState<ViewKey>("calendar");
  const [mediaType, setMediaType] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.upcoming", "grid");

  const queryMediaType = mediaType === "all" ? undefined : mediaType;

  const calendarQuery = trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
    { limit: PAGE_SIZE, mediaType: queryMediaType, mode: "all" },
    {
      getNextPageParam: (lp) => lp.nextCursor,
      initialCursor: 0,
      enabled: view === "calendar",
    },
  );

  const browseQuery = trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
    {
      limit: 24,
      mediaType: queryMediaType,
      q: filters.q,
    },
    {
      getNextPageParam: (lp) => lp.nextCursor,
      initialCursor: 0,
      enabled: view === "browse",
    },
  );

  const calendarItems = useMemo(
    () =>
      (calendarQuery.data?.pages.flatMap((p) => p.items) ?? []) as UpcomingScheduleItem[],
    [calendarQuery.data],
  );

  const handleCalendarLoadMore = useCallback(() => {
    if (calendarQuery.hasNextPage && !calendarQuery.isFetchingNextPage) {
      void calendarQuery.fetchNextPage();
    }
  }, [calendarQuery]);

  const allItems: BrowseItem[] = useMemo(
    () =>
      (browseQuery.data?.pages.flatMap((p) => p.items) ?? []).map((item) => ({
        id: item.id,
        externalId: item.externalId,
        provider: item.provider,
        type: item.mediaType as "movie" | "show",
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        year: item.year,
        releaseAt: item.releaseAt,
        episode: item.episode,
      })),
    [browseQuery.data],
  );

  const items = useMemo(
    () =>
      mediaType === "all" ? allItems : allItems.filter((i) => i.type === mediaType),
    [allItems, mediaType],
  );

  const handleBrowseFetchNextPage = useCallback(() => {
    if (browseQuery.hasNextPage && !browseQuery.isFetchingNextPage)
      void browseQuery.fetchNextPage();
  }, [browseQuery]);

  const viewToggle = (
    <TabBar
      tabs={VIEW_TABS.map((t) => ({
        value: t.value,
        label: t.label,
        icon: t.icon,
      }))}
      value={view}
      onChange={(v) => setView(v as ViewKey)}
    />
  );

  if (view === "calendar") {
    return (
      <div className="w-full md:pb-12">
        <PageHeader title="Upcoming Schedule" tabs={viewToggle} />
        <div className={cn(OUTER_PADDING, "mt-6 md:mt-8")}>
          <UpcomingCalendarMonth
            items={calendarItems}
            isLoading={calendarQuery.isLoading}
            isFetchingMore={calendarQuery.isFetchingNextPage}
            hasMore={!!calendarQuery.hasNextPage}
            onLoadMore={handleCalendarLoadMore}
          />
        </div>
      </div>
    );
  }

  return (
    <BrowseLayout
      title="Upcoming Schedule"
      subtitle="New episodes and releases on the horizon."
      items={items}
      strategy={progressStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={browseQuery.isLoading}
      isFetchingNextPage={browseQuery.isFetchingNextPage}
      hasNextPage={browseQuery.hasNextPage}
      onFetchNextPage={handleBrowseFetchNextPage}
      filterPreset="library"
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      emptyState={<StateMessage preset="emptyUpcoming" />}
      errorState={
        browseQuery.isError ? (
          <StateMessage preset="error" onRetry={() => void browseQuery.refetch()} />
        ) : undefined
      }
      header={<div className="mb-2">{viewToggle}</div>}
    />
  );
}
