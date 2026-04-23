"use client";

import { useState, useEffect } from "react";
import { cn } from "@canto/ui/cn";

export function FadeIn({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  // Opacity-only transition. Tailwind v4 maps translate-y-* onto the CSS
  // `translate` property, and any non-default `translate` value establishes a
  // containing block for fixed descendants — collapsing steps like SyncingStep
  // (which renders a `fixed inset-0` overlay) to 0x0 and leaving the screen
  // blank.
  return (
    <div
      className={cn(
        "transition-opacity duration-500 ease-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {children}
    </div>
  );
}
