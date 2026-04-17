"use client";

import { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";
import { cn } from "../lib/utils";
import { Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export interface TabBarProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Content rendered to the left of the tabs (e.g. filter button) */
  leading?: React.ReactNode;
  /** Content rendered to the right of the tabs (e.g. result count) */
  trailing?: React.ReactNode;
  /** Show a filter button inline with the tabs. Receives the toggle callback. */
  onFilter?: () => void;
  /** Whether the filter is currently active (controls button style) */
  filterActive?: boolean;
  className?: string;
}

export function TabBar({ tabs, value, onChange, leading, trailing, onFilter, filterActive, className }: TabBarProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);
  const tabsSignature = tabs.map((tab) => `${tab.value}:${tab.count ?? 0}`).join("|");

  const updateIndicator = useCallback(() => {
    const el = tabRefs.current.get(value);
    if (!el) return;

    setIndicator((prev) => {
      if (prev.left === el.offsetLeft && prev.width === el.offsetWidth) {
        return prev;
      }
      return { left: el.offsetLeft, width: el.offsetWidth };
    });
    setReady((prev) => prev || true);
  }, [value]);

  const scrollActiveIntoView = useCallback(() => {
    const el = tabRefs.current.get(value);
    const scroll = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !scroll || !inner) return;

    const tabLeft = inner.offsetLeft + el.offsetLeft;
    const scrollLeft = tabLeft - scroll.clientWidth / 2 + el.offsetWidth / 2;
    scroll.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [value]);

  useLayoutEffect(() => {
    updateIndicator();
    scrollActiveIntoView();
  }, [updateIndicator, scrollActiveIntoView]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateIndicator);
    return () => window.cancelAnimationFrame(frame);
  }, [tabsSignature, updateIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-1.5 py-3 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]", className)}>
      {onFilter && (
        <button
          type="button"
          className={cn(
            "-order-1 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl transition-all",
            filterActive
              ? "bg-foreground text-background"
              : "bg-muted/60 text-muted-foreground hover:text-foreground",
          )}
          onClick={onFilter}
        >
          <Settings2 className={cn("h-4 w-4 transition-transform duration-300", filterActive && "rotate-90")} />
        </button>
      )}
      {leading && <div className="shrink-0">{leading}</div>}
      {tabs.length > 0 && (
        <div
          ref={scrollRef}
          className={cn(
            "overflow-x-auto overflow-y-hidden scrollbar-none",
            onFilter
              ? "w-auto"
              : "order-last -mx-4 w-[calc(100%+2rem)] md:order-none md:mx-0 md:w-auto",
          )}
        >
          <div
            ref={innerRef}
            className={cn(
              "relative inline-flex items-center gap-0.5 rounded-xl bg-muted/60 p-1",
              !onFilter && "mx-4 md:mx-0",
            )}
          >
            <div
              className={cn(
                "absolute top-1 bottom-1 rounded-xl bg-foreground shadow-sm",
                ready
                  ? "transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
                  : "opacity-0",
              )}
              style={{ left: indicator.left, width: indicator.width }}
            />

            {tabs.map((tab) => {
              const isActive = value === tab.value;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.value}
                  ref={(el) => {
                    if (el) tabRefs.current.set(tab.value, el);
                  }}
                  type="button"
                  onClick={() => onChange(tab.value)}
                  className={cn(
                    "relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200",
                    isActive
                      ? "text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold leading-none",
                        isActive
                          ? "bg-background/20 text-background"
                          : "bg-foreground/5 text-muted-foreground",
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
    </div>
  );
}
