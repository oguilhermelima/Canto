"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface SpotlightNavigationProps {
  onPrev: () => void;
  onNext: () => void;
  enabled: boolean;
}

export function SpotlightNavigation({
  onPrev,
  onNext,
  enabled,
}: SpotlightNavigationProps): React.JSX.Element | null {
  if (!enabled) return null;
  return (
    <>
      <button
        aria-label="Previous"
        className="absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background/60 text-foreground/60 opacity-0 transition-opacity duration-200 hover:bg-background/80 hover:text-foreground group-hover/spotlight:opacity-100 md:flex lg:left-6"
        onClick={onPrev}
      >
        <ChevronLeft size={28} />
      </button>
      <button
        aria-label="Next"
        className="absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background/60 text-foreground/60 opacity-0 transition-opacity duration-200 hover:bg-background/80 hover:text-foreground group-hover/spotlight:opacity-100 md:flex lg:right-6"
        onClick={onNext}
      >
        <ChevronRight size={28} />
      </button>
    </>
  );
}
