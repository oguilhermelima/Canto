"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Tv } from "lucide-react";


import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { mediaHref } from "@/lib/media-href";
import { tmdbThumbLoader } from "@/lib/tmdb-image";
import type { UpcomingScheduleItem } from "@/components/media/cards/upcoming-schedule-card";

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const MIN_DAYS_AFTER_LAST_ITEM = 3;

interface DayBucket {
  date: Date;
  weekdayLong: string;
  isToday: boolean;
  isWeekend: boolean;
  items: UpcomingScheduleItem[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildBuckets(
  items: UpcomingScheduleItem[],
  daysToShow: number,
): DayBucket[] {
  const today = new Date();
  const todayStart = startOfDay(today);
  const buckets: DayBucket[] = [];

  for (let i = 0; i < daysToShow; i++) {
    const d = new Date(todayStart);
    d.setDate(todayStart.getDate() + i);
    const dow = d.getDay();
    buckets.push({
      date: d,
      weekdayLong: WEEKDAY_FORMATTER.format(d),
      isToday: i === 0,
      isWeekend: dow === 0 || dow === 6,
      items: [],
    });
  }

  for (const item of items) {
    const release = new Date(item.releaseAt);
    const releaseStart = startOfDay(release);
    const diffDays = Math.round(
      (releaseStart.getTime() - todayStart.getTime()) / 86_400_000,
    );
    if (diffDays >= 0 && diffDays < daysToShow) {
      const bucket = buckets[diffDays];
      if (bucket) bucket.items.push(item);
    }
  }

  return buckets;
}

function ItemRow({ item }: { item: UpcomingScheduleItem }): React.JSX.Element {
  const href = mediaHref(item.provider, item.externalId, item.mediaType);
  const epLabel = item.episode
    ? `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}`
    : "Movie release";
  const epTitle = item.episode?.title ?? null;
  const time = item.hasAirTime
    ? TIME_FORMATTER.format(new Date(item.releaseAt))
    : null;

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/30 p-3 transition-colors hover:border-border/80 hover:bg-card/60"
    >
      <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/40 sm:w-20">
        {item.posterPath ? (
          <Image
            loader={tmdbThumbLoader}
            src={item.posterPath}
            alt=""
            fill
            sizes="80px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Tv className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-base font-semibold text-foreground sm:text-lg">
          {item.title}
        </p>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground/80">
            {epLabel}
          </span>
          {epTitle && <span> · {epTitle}</span>}
        </p>
      </div>
      {time && (
        <span className="shrink-0 self-start text-[11px] font-bold uppercase tracking-[0.18em] tabular-nums text-muted-foreground">
          {time}
        </span>
      )}
    </Link>
  );
}

function DayRow({ bucket }: { bucket: DayBucket }): React.JSX.Element {
  const dayNum = bucket.date.getDate();
  const monthShort = MONTH_FORMATTER.format(bucket.date);

  return (
    <div
      data-day={bucket.isToday ? "today" : undefined}
      className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr]"
    >
      <div className="md:sticky md:top-24 md:self-start">
        <div
          className={cn(
            "flex items-baseline gap-3 border-l-2 pl-4 transition-colors",
            bucket.isToday
              ? "border-foreground"
              : bucket.isWeekend
                ? "border-border/30"
                : "border-border/60",
          )}
        >
          <span
            className={cn(
              "text-5xl font-extrabold tabular-nums leading-none tracking-tight md:text-6xl",
              bucket.isToday ? "text-foreground" : "text-foreground/55",
            )}
          >
            {dayNum}
          </span>
          <div className="flex flex-col gap-0.5 leading-none">
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-[0.2em]",
                bucket.isToday
                  ? "text-foreground"
                  : bucket.isWeekend
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground",
              )}
            >
              {bucket.isToday ? "Today" : bucket.weekdayLong}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {monthShort}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {bucket.items.length === 0 ? (
          <div className="flex h-20 items-center rounded-2xl border border-dashed border-border/40 bg-card/20 px-4 md:h-24">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40">
              Quiet day
            </span>
          </div>
        ) : (
          bucket.items.map((item) => <ItemRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

interface UpcomingCalendarMonthProps {
  items: UpcomingScheduleItem[];
  isLoading: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
}

export function UpcomingCalendarMonth({
  items,
  isLoading,
  isFetchingMore = false,
  hasMore = false,
  onLoadMore,
  className,
}: UpcomingCalendarMonthProps): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const daysToShow = useMemo(() => {
    const lastItem = items[items.length - 1];
    if (!lastItem) return 14;
    const today = startOfDay(new Date());
    const last = startOfDay(new Date(lastItem.releaseAt));
    const diff = Math.round((last.getTime() - today.getTime()) / 86_400_000);
    return Math.max(14, diff + MIN_DAYS_AFTER_LAST_ITEM + 1);
  }, [items]);

  const buckets = useMemo(
    () => buildBuckets(items, daysToShow),
    [items, daysToShow],
  );

  // Intersection observer to load more when sentinel is visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onLoadMore || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingMore) {
          onLoadMore();
        }
      },
      { threshold: 0, rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isFetchingMore, items.length]);

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-8", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr]"
          >
            <Skeleton className="h-16 w-32 rounded-lg" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {buckets.map((bucket) => (
        <DayRow key={bucket.date.toISOString()} bucket={bucket} />
      ))}
      <div ref={sentinelRef} aria-hidden />
      {isFetchingMore && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
