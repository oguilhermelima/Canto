"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Called when the back button is pressed */
  onBack?: () => void;
  /** Sticky header rendered at top of viewport when the h1 scrolls out of view */
  stickyHeader?: (isTitleVisible: boolean) => ReactNode;
};

export function PageHeader({
  title,
  subtitle,
  children,
  action,
  className,
  onBack,
  stickyHeader,
}: PageHeaderProps): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isTitleVisible, setIsTitleVisible] = useState(true);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsTitleVisible(entry.isIntersecting);
      },
      { threshold: 0.1, rootMargin: "-60px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {stickyHeader?.(isTitleVisible)}
      <div className={cn("px-4 pt-16 pb-5 md:px-8 md:pt-8 md:pb-8 lg:px-12 xl:px-16 2xl:px-24", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1
              className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl"
              ref={titleRef}
            >
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="hidden shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground md:flex"
                >
                  <ArrowLeft size={24} />
                </button>
              )}
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-muted-foreground md:pl-9">{subtitle}</p>
            )}
            {children && <div className="mt-1.5">{children}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
    </>
  );
}
