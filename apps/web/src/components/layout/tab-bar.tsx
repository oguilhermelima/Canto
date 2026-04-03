"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@canto/ui/cn";
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
  className?: string;
}

export function TabBar({ tabs, value, onChange, leading, className }: TabBarProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const updateIndicator = useCallback(() => {
    const el = tabRefs.current.get(value);
    if (!el) return;

    // Use offsetLeft/offsetWidth — immune to scroll position
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    setReady(true);
  }, [value]);

  const scrollActiveIntoView = useCallback(() => {
    const el = tabRefs.current.get(value);
    const container = containerRef.current;
    if (!el || !container) return;

    // Center the active tab within the scrollable container
    const scrollLeft = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
    container.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [value]);

  useEffect(() => {
    updateIndicator();
    scrollActiveIntoView();
  }, [updateIndicator, scrollActiveIntoView]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <div className={cn("flex items-center gap-2 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]", className)}>
      {leading && <div className="shrink-0">{leading}</div>}
      <div
        ref={containerRef}
        className="relative inline-flex items-center gap-0.5 overflow-x-auto rounded-2xl bg-muted/60 p-1 scrollbar-none"
      >
        {/* Sliding pill indicator */}
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
                    "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none",
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
  );
}
