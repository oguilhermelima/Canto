"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCollapseProps {
  open: boolean;
  children: React.ReactNode;
}

export function AnimatedCollapse({
  open,
  children,
}: AnimatedCollapseProps): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      // Update height on content changes while open
      const observer = new ResizeObserver(() => {
        if (contentRef.current) setHeight(contentRef.current.scrollHeight);
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }
    setHeight(0);
    return undefined;
  }, [open]);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: open ? height : 0, opacity: open ? 1 : 0 }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
