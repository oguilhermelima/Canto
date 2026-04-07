"use client";

import { useState, useEffect } from "react";
import { cn } from "@canto/ui/cn";

export function FadeIn({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      )}
    >
      {children}
    </div>
  );
}
