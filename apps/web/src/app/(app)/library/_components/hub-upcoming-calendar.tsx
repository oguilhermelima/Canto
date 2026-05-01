"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarClock, ChevronDown, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { SectionTitle } from "@canto/ui/section-title";
import { trpc } from "@/lib/trpc/client";
import { mediaHref } from "@/lib/media-href";
import { tmdbThumbLoader } from "@/lib/tmdb-image";
import type { UpcomingScheduleItem } from "@/components/media/cards/upcoming-schedule-card";

const WINDOW_DAYS = 30;
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });
const DAY_TITLE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const SCROLL_PADDING_X =
  "px-4 md:pl-8 md:pr-8 lg:pl-12 lg:pr-12 xl:pl-16 xl:pr-16 2xl:pl-24 2xl:pr-24";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Generate `WINDOW_DAYS` days starting at `start`, stepping +1 day each. */
function buildDays(start: Date): Date[] {
  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
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
      className="group/item -mx-2 flex items-center gap-4 rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-border/50 hover:bg-foreground/[0.04]"
    >
      <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/40 transition-shadow group-hover/item:ring-border/70">
        {item.posterPath ? (
          <Image
            loader={tmdbThumbLoader}
            src={item.posterPath}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Tv className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1 leading-tight">
        <p className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover/item:text-foreground">
          {item.title}
        </p>
        <p className="line-clamp-1 text-xs font-medium tabular-nums text-muted-foreground">
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

function DayPill({
  date,
  active,
  hasItems,
  onSelect,
  refCallback,
}: {
  date: Date;
  active: boolean;
  hasItems: boolean;
  onSelect: () => void;
  refCallback?: (el: HTMLButtonElement | null) => void;
}): React.JSX.Element {
  const dayNum = date.getDate();
  // Show month label on the 1st of any month so the row shows month transitions.
  const showMonth = dayNum === 1;
  return (
    <button
      ref={refCallback}
      type="button"
      onClick={onSelect}
      className={cn(
        "group/pill flex shrink-0 flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors",
        active
          ? "bg-foreground/[0.1] text-foreground"
          : "text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground/90",
      )}
    >
      {showMonth ? (
        <span
          className={cn(
            "text-[9px] font-bold uppercase tracking-[0.18em] leading-none",
            active ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {MONTH_FORMATTER.format(date)}
        </span>
      ) : (
        <span className="h-[9px] leading-none" aria-hidden />
      )}
      <span className="text-base font-bold tabular-nums leading-none">
        {dayNum}
      </span>
      <span
        className={cn(
          "h-1 w-1 rounded-full transition-colors",
          hasItems
            ? active
              ? "bg-foreground"
              : "bg-foreground/40"
            : "bg-transparent",
        )}
        aria-hidden
      />
    </button>
  );
}

function PillRowSkeleton(): React.JSX.Element {
  return (
    <div className="flex gap-1 overflow-hidden pb-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-[60px] w-10 shrink-0 rounded-lg" />
      ))}
    </div>
  );
}

export function HubUpcomingCalendar(): React.JSX.Element {
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => buildDays(today), [today]);
  const fromDate = days[0] ?? today;
  const toDate = useMemo(() => {
    const last = days[days.length - 1] ?? today;
    const end = new Date(last);
    end.setDate(end.getDate() + 1);
    return end;
  }, [days, today]);

  const query = trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
    {
      limit: 30,
      mode: "all",
      from: fromDate,
      to: toDate,
    },
    {
      staleTime: 60_000,
      getNextPageParam: (lp) => lp.nextCursor,
      initialCursor: 0,
    },
  );

  // Fetch the next page eagerly while the visible window still has more.
  // Each request stays small (30 items) but the user sees dots populate
  // progressively instead of waiting on one giant payload.
  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query.hasNextPage, query.isFetchingNextPage, query]);

  const isLoading = query.isLoading;
  const items = useMemo(
    () =>
      (query.data?.pages.flatMap((p) => p.items) ?? []) as UpcomingScheduleItem[],
    [query.data],
  );

  const itemsByDay = useMemo(() => {
    const map = new Map<string, UpcomingScheduleItem[]>();
    for (const raw of items) {
      const key = dateKey(startOfDay(new Date(raw.releaseAt)));
      const bucket = map.get(key) ?? [];
      bucket.push(raw);
      map.set(key, bucket);
    }
    return map;
  }, [items]);

  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const selectedKey = dateKey(selectedDay);
  const selectedItems = itemsByDay.get(selectedKey) ?? [];
  const dayTitle = DAY_TITLE_FORMATTER.format(selectedDay);

  const [expanded, setExpanded] = useState(false);
  // Reset to collapsed whenever the active day changes.
  useEffect(() => {
    setExpanded(false);
  }, [selectedKey]);

  const collapsedCount = 3;
  const visibleItems = expanded
    ? selectedItems
    : selectedItems.slice(0, collapsedCount);
  const hiddenCount = Math.max(0, selectedItems.length - collapsedCount);

  // Keep the active pill in view: when selectedDay changes, scroll the
  // matching pill into the visible area of the row container.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  useEffect(() => {
    const el = pillRefs.current.get(selectedKey);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedKey]);

  return (
    <section>
      <SectionTitle
        icon={CalendarClock}
        title="Calendar"
        seeMorePath="/library/upcoming"
        linkAs={Link}
      />

      <div className="mt-4 flex flex-col gap-5 pb-4 md:mt-5">
        {isLoading && itemsByDay.size === 0 ? (
          <div className={SCROLL_PADDING_X}>
            <PillRowSkeleton />
          </div>
        ) : (
          <div
            ref={rowRef}
            className={cn(
              "flex gap-1 overflow-x-auto pb-1 scrollbar-none",
              SCROLL_PADDING_X,
            )}
          >
            {days.map((d) => {
              const key = dateKey(d);
              return (
                <DayPill
                  key={key}
                  date={d}
                  active={key === selectedKey}
                  hasItems={(itemsByDay.get(key)?.length ?? 0) > 0}
                  onSelect={() => setSelectedDay(new Date(d))}
                  refCallback={(el) => {
                    if (el) pillRefs.current.set(key, el);
                    else pillRefs.current.delete(key);
                  }}
                />
              );
            })}
          </div>
        )}

        <div className={cn("flex flex-col gap-3 pt-1", SCROLL_PADDING_X)}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {dayTitle}
          </p>
          {isLoading && itemsByDay.size === 0 ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-3 py-2.5">
                  <Skeleton className="aspect-[2/3] w-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : selectedItems.length === 0 ? (
            <p
              key={selectedKey}
              className="animate-in fade-in-0 slide-in-from-top-2 duration-200 py-2 text-sm text-muted-foreground/60"
            >
              Nothing scheduled.
            </p>
          ) : (
            <div
              key={selectedKey}
              className="animate-in fade-in-0 slide-in-from-top-2 flex flex-col gap-1 duration-200"
            >
              {visibleItems.map((item) => (
                <CalendarItem key={item.id} item={item} />
              ))}
              {hiddenCount > 0 && !expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="-mx-2 mt-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  Show {hiddenCount} more
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
