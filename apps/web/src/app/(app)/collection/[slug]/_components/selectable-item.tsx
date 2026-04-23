"use client";

import { cn } from "@canto/ui/cn";
import { Check } from "lucide-react";

interface SelectableItemProps {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: "grid" | "list";
}

export function SelectableItem({
  selected,
  onToggle,
  children,
  variant = "grid",
}: SelectableItemProps): React.JSX.Element {
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group/select relative cursor-pointer rounded-xl outline-none transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        variant === "list" && "flex",
      )}
    >
      <div className="pointer-events-none">{children}</div>

      <div
        className={cn(
          "absolute flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
          variant === "grid" ? "left-2 top-2 z-20" : "right-3 top-1/2 z-20 -translate-y-1/2",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/80 bg-black/50 text-transparent backdrop-blur-sm",
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </div>
    </div>
  );
}
