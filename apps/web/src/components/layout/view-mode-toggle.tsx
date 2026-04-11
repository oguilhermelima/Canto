"use client";

import { LayoutGrid, List } from "lucide-react";
import { cn } from "@canto/ui/cn";

export type ViewMode = "grid" | "list";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewModeToggle({
  value,
  onChange,
  className,
}: ViewModeToggleProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center rounded-lg bg-accent/60 p-0.5", className)}>
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={cn(
          "flex items-center justify-center rounded-md p-1.5 transition-colors",
          value === "grid"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "flex items-center justify-center rounded-md p-1.5 transition-colors",
          value === "list"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="List view"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
