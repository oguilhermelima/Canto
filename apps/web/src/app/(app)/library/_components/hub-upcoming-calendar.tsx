"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarClock, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { SectionTitle } from "@canto/ui/section-title";
import { trpc } from "@/lib/trpc/client";
import { mediaHref } from "@/lib/media-href";
import { tmdbThumbLoader } from "@/lib/tmdb-image";
import type { UpcomingScheduleItem } from "@/components/media/cards/upcoming-schedule-card";

const DAYS = 7;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const COLUMN_WIDTH = "w-[340px] shrink-0 lg:w-[400px]";
const SCROLL_PADDING_X =
  "px-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24";
// Vary skeleton density across columns so the loading state looks like a real
// calendar (some days busy, some sparse) instead of a uniform grid.
const SKELETON_ITEM_COUNTS = [3, 1, 2, 1, 2, 0, 1];

interface DayBucket {
  date: Date;
  weekdayShort: string;
  isToday: boolean;
  isWeekend: boolean;
  items: UpcomingScheduleItem[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildBuckets(items: UpcomingScheduleItem[]): DayBucket[] {
  const today = new Date();
  const todayStart = startOfDay(today);
  const buckets: DayBucket[] = [];

  for (let i = 0; i < DAYS; i++) {
    const d = new Date(todayStart);
    d.setDate(todayStart.getDate() + i);
    const dow = d.getDay();
    buckets.push({
      date: d,
      weekdayShort: WEEKDAY_FORMATTER.format(d),
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
    if (diffDays >= 0 && diffDays < DAYS) {
      buckets[diffDays]!.items.push(item);
    }
  }

  return buckets;
}

function CalendarItem({
  item,
}: {
  item: UpcomingScheduleItem;
}): React.JSX.Element {
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
      className="group/item -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.06]"
    >
      <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/40">
        {item.posterPath ? (
          <Image
            loader={tmdbThumbLoader}
            src={item.posterPath}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Tv className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="line-clamp-1 text-sm font-semibold text-foreground">
          {item.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs font-medium tabular-nums text-muted-foreground">
          {epLabel}
          {epTitle ? ` · ${epTitle}` : ""}
        </p>
      </div>
      {time && (
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] tabular-nums text-muted-foreground">
          {time}
        </span>
      )}
    </Link>
  );
}

function DayHeader({ bucket }: { bucket: DayBucket }): React.JSX.Element {
  const dayNum = bucket.date.getDate();
  const showMonth = dayNum === 1 || bucket.isToday;
  const monthShort = showMonth ? MONTH_FORMATTER.format(bucket.date) : null;

  return (
    <div
      className={cn(
        "mb-3 flex items-baseline justify-between gap-2 border-b pb-2.5 transition-colors",
        bucket.isToday
          ? "border-foreground/70"
          : "border-border/40 group-hover/day:border-border/70",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[11px] font-bold uppercase tracking-[0.18em]",
            bucket.isToday
              ? "text-foreground"
              : bucket.isWeekend
                ? "text-muted-foreground/70"
                : "text-muted-foreground",
          )}
        >
          {bucket.isToday ? "Today" : bucket.weekdayShort}
        </span>
        {monthShort && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {monthShort}
          </span>
        )}
      </div>
      <span
        className={cn(
          "text-3xl font-extrabold tabular-nums leading-none",
          bucket.isToday ? "text-foreground" : "text-foreground/55",
        )}
      >
        {dayNum}
      </span>
    </div>
  );
}

function DayColumn({ bucket }: { bucket: DayBucket }): React.JSX.Element {
  return (
    <div className={cn("group/day flex flex-col", COLUMN_WIDTH)}>
      <DayHeader bucket={bucket} />
      {bucket.items.length === 0 ? (
        <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/30">
          Quiet day
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {bucket.items.map((item) => (
            <CalendarItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileDayChip({
  bucket,
  active,
  onSelect,
}: {
  bucket: DayBucket;
  active: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const dayNum = bucket.date.getDate();
  const count = bucket.items.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group/chip flex shrink-0 flex-col items-stretch gap-2 border-b-2 pb-2 pt-1 transition-colors",
        active
          ? "border-foreground"
          : "border-border/40 hover:border-border/70",
      )}
    >
      <div className="flex min-w-[3.25rem] items-baseline justify-between gap-2 px-1">
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.18em]",
            active
              ? "text-foreground"
              : bucket.isWeekend
                ? "text-muted-foreground/70"
                : "text-muted-foreground",
          )}
        >
          {bucket.isToday ? "Today" : bucket.weekdayShort}
        </span>
        <span
          className={cn(
            "text-2xl font-extrabold tabular-nums leading-none",
            active ? "text-foreground" : "text-foreground/55",
          )}
        >
          {dayNum}
        </span>
      </div>
      {count > 0 && (
        <span
          className={cn(
            "px-1 text-left text-[10px] font-semibold tabular-nums",
            active ? "text-muted-foreground" : "text-muted-foreground/55",
          )}
        >
          {count} {count === 1 ? "release" : "releases"}
        </span>
      )}
    </button>
  );
}

function MobileDayView({ bucket }: { bucket: DayBucket }): React.JSX.Element {
  if (bucket.items.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground/60">
        Nothing scheduled.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {bucket.items.map((item) => (
        <CalendarItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function DayColumnSkeleton({ bucket, itemCount }: { bucket: DayBucket; itemCount: number }): React.JSX.Element {
  return (
    <div className={cn("group/day flex flex-col", COLUMN_WIDTH)}>
      <DayHeader bucket={bucket} />
      {itemCount === 0 ? (
        <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/30">
          Quiet day
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {Array.from({ length: itemCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="aspect-[2/3] w-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HubUpcomingCalendar(): React.JSX.Element {
  const { data, isLoading } = trpc.userMedia.getUpcomingSchedule.useQuery(
    { limit: 100, mode: "all" },
    { staleTime: 60_000 },
  );

  const buckets = useMemo(
    () => buildBuckets((data?.items ?? []) as UpcomingScheduleItem[]),
    [data?.items],
  );
  const hasAnyItems = buckets.some((b) => b.items.length > 0);

  // Mobile: pick the first day with items (today preferred), default to 0.
  const defaultMobileDay =
    buckets.findIndex((b) => b.items.length > 0) >= 0
      ? buckets.findIndex((b) => b.items.length > 0)
      : 0;
  const [selectedDay, setSelectedDay] = useState(defaultMobileDay);
  const activeBucket = buckets[selectedDay] ?? buckets[0]!;

  return (
    <section>
      <SectionTitle
        icon={CalendarClock}
        title="This Week"
        seeMorePath="/library/upcoming"
        linkAs={Link}
      />

      {/* Mobile: day chips + selected day list. Desktop: 7-col scrollable grid. */}
      <div className="md:hidden">
        {isLoading ? (
          <div className={cn("pb-4", SCROLL_PADDING_X)}>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3">
              {buckets.map((b) => (
                <Skeleton key={b.date.toISOString()} className="h-[68px] w-16 shrink-0 rounded-2xl" />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton className="aspect-[2/3] w-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !hasAnyItems ? (
          <p className={cn("py-2 text-sm text-muted-foreground", SCROLL_PADDING_X)}>
            Nothing scheduled this week.
          </p>
        ) : (
          <div className={cn("pb-4", SCROLL_PADDING_X)}>
            <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-none px-1 pb-3">
              {buckets.map((b, i) => (
                <MobileDayChip
                  key={b.date.toISOString()}
                  bucket={b}
                  active={i === selectedDay}
                  onSelect={() => setSelectedDay(i)}
                />
              ))}
            </div>
            <MobileDayView bucket={activeBucket} />
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <div
          className={cn(
            "flex items-start gap-6 overflow-x-auto overflow-y-visible pb-4 scrollbar-none",
            SCROLL_PADDING_X,
          )}
        >
          {isLoading
            ? buckets.map((bucket, i) => (
                <DayColumnSkeleton
                  key={bucket.date.toISOString()}
                  bucket={bucket}
                  itemCount={SKELETON_ITEM_COUNTS[i % SKELETON_ITEM_COUNTS.length]!}
                />
              ))
            : buckets.map((bucket) => (
                <DayColumn key={bucket.date.toISOString()} bucket={bucket} />
              ))}
        </div>
      </div>
    </section>
  );
}
