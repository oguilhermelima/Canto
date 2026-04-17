"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@canto/ui/cn";

const MAX_DOTS = 5;

function SpotlightProgressFill({ slideKey }: { slideKey: number }): React.JSX.Element {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setStarted(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setStarted(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [slideKey]);

  return (
    <div
      className="absolute inset-0 origin-left rounded-full bg-foreground/70 will-change-transform"
      style={{
        transform: `scaleX(${started ? 1 : 0})`,
        transition: started ? "transform 10s linear" : "none",
      }}
    />
  );
}

interface SpotlightProgressDotsProps {
  total: number;
  current: number;
  onSelect: (index: number) => void;
}

export function SpotlightProgressDots({
  total,
  current,
  onSelect,
}: SpotlightProgressDotsProps): React.JSX.Element {
  const visibleDots = useMemo(() => {
    if (total <= MAX_DOTS) return Array.from({ length: total }, (_, i) => i);
    const half = Math.floor(MAX_DOTS / 2);
    const start = Math.max(0, Math.min(current - half, total - MAX_DOTS));
    return Array.from({ length: MAX_DOTS }, (_, i) => start + i);
  }, [total, current]);

  return (
    <div className="mt-4 flex items-center justify-center gap-1.5 md:absolute md:inset-x-0 md:bottom-[3.1rem] md:mt-0">
      {visibleDots.map((dotIndex) => {
        const isActive = dotIndex === current;
        const isPast = dotIndex < current;
        const isEdge =
          total > MAX_DOTS &&
          ((dotIndex === visibleDots[0] && dotIndex > 0) ||
            (dotIndex === visibleDots[visibleDots.length - 1] &&
              dotIndex < total - 1));

        return (
          <button
            key={dotIndex}
            type="button"
            aria-label={`Go to slide ${dotIndex + 1}`}
            className={cn(
              "relative overflow-hidden rounded-full transition-[width,background-color,transform,opacity] duration-300 ease-out",
              isActive
                ? "h-1.5 w-8 bg-foreground/15"
                : "h-1.5 w-1.5 bg-foreground/15 hover:bg-foreground/30",
              isEdge && "scale-75 opacity-50",
            )}
            onClick={() => onSelect(dotIndex)}
          >
            {isActive ? (
              <SpotlightProgressFill slideKey={current} />
            ) : (
              <div
                className={cn(
                  "absolute inset-0 rounded-full bg-foreground/70",
                  isPast ? "opacity-100" : "opacity-0",
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
