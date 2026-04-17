"use client";

import { CalendarRange } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@canto/ui/popover";
import {
  MONTH_NAMES,
  buildDatetimeFromParts,
  daysInMonth,
  formatLocalDateTime,
  smallControlClassName,
  toDatetimeLocalString,
} from "./utils";

interface DateTimeValuePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function DateTimeValuePicker({
  value,
  onChange,
}: DateTimeValuePickerProps): React.JSX.Element {
  const now = new Date();
  const parsed = new Date(value);
  const resolved = Number.isNaN(parsed.getTime()) ? now : parsed;

  const year = resolved.getFullYear();
  const month = resolved.getMonth() + 1;
  const day = resolved.getDate();
  const hour = resolved.getHours();
  const minute = resolved.getMinutes();
  const maxDay = daysInMonth(year, month);

  const years = Array.from({ length: 83 }).map(
    (_, index) => now.getFullYear() - 80 + index,
  );

  const update = (
    parts: Partial<{
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
    }>,
  ): void => {
    onChange(
      buildDatetimeFromParts({
        year: parts.year ?? year,
        month: parts.month ?? month,
        day: parts.day ?? day,
        hour: parts.hour ?? hour,
        minute: parts.minute ?? minute,
      }),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-xl bg-accent px-3 text-sm text-foreground transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
        >
          <span>{formatLocalDateTime(value)}</span>
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] rounded-xl border border-border bg-background p-3"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Day
              </label>
              <select
                className={smallControlClassName}
                value={day}
                onChange={(event) => update({ day: Number(event.target.value) })}
              >
                {Array.from({ length: maxDay }).map((_, index) => {
                  const optionDay = index + 1;
                  return (
                    <option key={optionDay} value={optionDay}>
                      {optionDay}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Month
              </label>
              <select
                className={smallControlClassName}
                value={month}
                onChange={(event) =>
                  update({ month: Number(event.target.value) })
                }
              >
                {MONTH_NAMES.map((monthName, index) => {
                  const optionMonth = index + 1;
                  return (
                    <option key={monthName} value={optionMonth}>
                      {monthName}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <select
                className={smallControlClassName}
                value={year}
                onChange={(event) =>
                  update({ year: Number(event.target.value) })
                }
              >
                {years.map((optionYear) => (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Hour
              </label>
              <select
                className={smallControlClassName}
                value={hour}
                onChange={(event) =>
                  update({ hour: Number(event.target.value) })
                }
              >
                {Array.from({ length: 24 }).map((_, index) => (
                  <option key={index} value={index}>
                    {String(index).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Minute
              </label>
              <select
                className={smallControlClassName}
                value={minute}
                onChange={(event) =>
                  update({ minute: Number(event.target.value) })
                }
              >
                {Array.from({ length: 60 }).map((_, index) => (
                  <option key={index} value={index}>
                    {String(index).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-xl bg-accent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onChange(toDatetimeLocalString(new Date()))}
            >
              Use current time
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
