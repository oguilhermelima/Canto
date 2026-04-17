"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@canto/ui/popover";
import type { MultiSelectOption } from "./types";

interface ChipMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
}

export function ChipMultiSelect({
  value,
  onChange,
  options,
  placeholder,
}: ChipMultiSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = (optionValue: string): void => {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-[36px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-accent px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          {value.length === 0 ? (
            <span className="truncate">{placeholder ?? "Select..."}</span>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {value.map((selectedValue) => {
                const label =
                  options.find((option) => option.value === selectedValue)
                    ?.label ?? selectedValue;
                return (
                  <span
                    key={selectedValue}
                    className="inline-flex max-w-full items-center gap-1 rounded-md bg-foreground/10 px-1.5 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span className="truncate">{label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(selectedValue);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          toggle(selectedValue);
                        }
                      }}
                      className="cursor-pointer rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] rounded-xl border-border bg-background p-1"
        onWheel={(event) => event.stopPropagation()}
      >
        <div
          className="max-h-[240px] overflow-y-auto"
          onWheel={(event) => {
            event.stopPropagation();
            event.currentTarget.scrollTop += event.deltaY;
          }}
        >
          {options.map((option) => {
            const selected = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors",
                  selected
                    ? "bg-foreground/5 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-muted-foreground",
                  )}
                >
                  {selected && <Check className="h-2 w-2" />}
                </div>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
