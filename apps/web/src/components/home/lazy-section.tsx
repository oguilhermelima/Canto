"use client";

import { useEffect, useRef, useState } from "react";

interface LazySectionProps {
  id: string;
  minHeight: number | string;
  rootMargin?: string;
  eager?: boolean;
  keepMounted?: boolean;
  children: React.ReactNode;
}

export function LazySection({
  id,
  minHeight,
  rootMargin = "800px 0px",
  eager = false,
  keepMounted = true,
  children,
}: LazySectionProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState<boolean>(eager);

  useEffect(() => {
    if (eager) return;
    if (mounted && keepMounted) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [eager, keepMounted, mounted, rootMargin]);

  const minHeightStyle = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  const isRendered = mounted || eager;

  return (
    <div
      ref={ref}
      data-lazy-section-id={id}
      style={
        isRendered
          ? undefined
          : {
              minHeight: minHeightStyle,
              contentVisibility: "auto",
              containIntrinsicSize: minHeightStyle,
            }
      }
    >
      {isRendered ? children : null}
    </div>
  );
}
