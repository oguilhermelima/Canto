"use client";

import { Settings2 } from "lucide-react";
import { cn } from "@canto/ui/cn";

export function FilterButton({
  active,
  onClick,
  className,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[38px] w-[38px] items-center justify-center rounded-xl transition-all",
        active
          ? "bg-foreground text-background"
          : "bg-muted/60 text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={onClick}
    >
      <Settings2
        className={cn(
          "h-4 w-4 transition-transform duration-300",
          active && "rotate-90",
        )}
      />
    </button>
  );
}
