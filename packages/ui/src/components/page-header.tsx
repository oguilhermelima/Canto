"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  action?: ReactNode;
  /**
   * Renders inline navigation (e.g. TabBar) at the bottom of the header block,
   * visually grouped with the title.
   */
  tabs?: ReactNode;
  className?: string;
  /**
   * Sticky header rendered at top of viewport when the h1 scrolls out of view.
   * Mobile-only navigation lives here — desktop relies on browser/topbar nav.
   */
  stickyHeader?: (isTitleVisible: boolean) => ReactNode;
};

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  children,
  action,
  tabs,
  className,
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
      <div
        className={cn(
          "px-4 pt-12 md:px-8 md:pt-16 lg:px-12 xl:px-16 2xl:px-24",
          tabs ? "pb-0" : "pb-6 md:pb-8",
          className,
        )}
      >
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-3 xl:gap-4">
              {Icon && (
                <div className="flex shrink-0 items-center justify-center text-foreground">
                  <Icon className="h-7 w-7 lg:h-9 lg:w-9 xl:h-11 xl:w-11" />
                </div>
              )}
              <h1
                className="text-left text-4xl font-medium tracking-tight text-foreground lg:text-5xl 2xl:text-6xl"
                ref={titleRef}
              >
                {title}
              </h1>
            </div>
            {subtitle && (
              <p className="text-left text-base text-foreground/70 lg:text-lg">
                {subtitle}
              </p>
            )}
            {children && <div>{children}</div>}
          </div>
          {action && <div className="shrink-0 self-end">{action}</div>}
        </div>
        {tabs && <div className="mt-6 md:mt-8">{tabs}</div>}
      </div>
    </>
  );
}
