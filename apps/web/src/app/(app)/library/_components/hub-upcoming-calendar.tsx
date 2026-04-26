"use client";

import { useMemo } from "react";
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
const COLUMN_WIDTH = "w-[340px] sm:w-[360px] lg:w-[400px]";
const SCROLL_PADDING_X =
  "pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24";

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
    </Link>
  );
}

function DayColumn({ bucket }: { bucket: DayBucket }): React.JSX.Element {
  const dayNum = bucket.date.getDate();
  const showMonth = dayNum === 1 || bucket.isToday;
  const monthShort = showMonth ? MONTH_FORMATTER.format(bucket.date) : null;

  return (
    <div className={cn("group/day flex shrink-0 flex-col", COLUMN_WIDTH)}>
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
      {bucket.items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/30">
            Quiet day
          </span>
        </div>
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

export function HubUpcomingCalendar(): React.JSX.Element {
  const { data, isLoading } = trpc.userMedia.getUpcomingSchedule.useQuery(
    { limit: 100, mode: "all" },
    { staleTime: 60_000 },
  );

  const buckets = useMemo(
    () => buildBuckets((data?.items ?? []) as UpcomingScheduleItem[]),
    [data?.items],
  );

  return (
    <section>
      <SectionTitle
        icon={CalendarClock}
        title="This Week"
        seeMorePath="/library/upcoming"
        linkAs={Link}
      />

      <div className="mt-2">
        <div
          className={cn(
            "flex gap-6 overflow-x-auto overflow-y-visible pb-3 scrollbar-none",
            SCROLL_PADDING_X,
          )}
        >
          {isLoading
            ? Array.from({ length: DAYS }).map((_, i) => (
                <div
                  key={i}
                  className={cn("flex shrink-0 flex-col gap-3", COLUMN_WIDTH)}
                >
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ))
            : buckets.map((bucket) => (
                <DayColumn key={bucket.date.toISOString()} bucket={bucket} />
              ))}
        </div>
      </div>
    </section>
  );
}
