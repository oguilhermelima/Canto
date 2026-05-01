"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@canto/ui/cn";

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(viewMonth: Date): Date[] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function weekdayHeaders(): string[] {
  // Week starts Sunday in our grid above.
  const sunday = new Date(2024, 0, 7); // a known Sunday
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return WEEKDAY_FORMATTER.format(d);
  });
}

interface HistoryCalendarFilterProps {
  selected: Date | null;
  onSelect: (date: Date | null) => void;
  className?: string;
}

export function HistoryCalendarFilter({
  selected,
  onSelect,
  className,
}: HistoryCalendarFilterProps): React.JSX.Element {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const days = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const headers = useMemo(() => weekdayHeaders(), []);

  const goPrev = (): void => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };
  const goNext = (): void => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };
  const goToday = (): void => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/30 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrev}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={goToday}
          className="flex-1 text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-foreground/70"
        >
          {MONTH_YEAR_FORMATTER.format(viewMonth)}
        </button>
        <button
          type="button"
          onClick={goNext}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {headers.map((wd, i) => (
          <div
            key={i}
            className="flex h-6 items-center justify-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60"
          >
            {wd}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = selected !== null && isSameDay(day, selected);
          const isFuture = day.getTime() > today.getTime();

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(isSelected ? null : day)}
              className={cn(
                "flex h-9 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors",
                isSelected
                  ? "bg-foreground text-background"
                  : isToday
                    ? "ring-1 ring-foreground/40 text-foreground hover:bg-muted"
                    : inMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/30 hover:bg-muted/50",
                isFuture && "cursor-not-allowed opacity-30 hover:bg-transparent",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
          <span className="text-xs font-medium text-muted-foreground">
            {DAY_LABEL_FORMATTER.format(selected)}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Convert a selected Date into the ISO datetime strings expected by the
 * `watchedFrom` / `watchedTo` filter fields. Spans the entire local day.
 */
export function selectedDayToFilter(date: Date): {
  watchedFrom: string;
  watchedTo: string;
} {
  return {
    watchedFrom: startOfDay(date).toISOString(),
    watchedTo: endOfDay(date).toISOString(),
  };
}
