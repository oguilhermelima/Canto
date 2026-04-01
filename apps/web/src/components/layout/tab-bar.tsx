"use client";

import { cn } from "@canto/ui/cn";

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export interface TabBarProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TabBar({ tabs, value, onChange, className }: TabBarProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto scrollbar-none", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all",
            value === tab.value
              ? "bg-foreground text-background"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className={cn(
              "ml-1.5 text-xs",
              value === tab.value ? "text-foreground/60" : "text-muted-foreground",
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
