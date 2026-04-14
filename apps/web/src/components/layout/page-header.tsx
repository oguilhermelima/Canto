"use client";

import { useIntersectionObserver } from "usehooks-ts";
import { TitleBar } from "~/components/layout/titlebar";
import { cn } from "@canto/ui/cn";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
};

export function PageHeader({ title, subtitle, children, action, className, onNavigate }: PageHeaderProps): React.JSX.Element {
  const { ref: titleRef, isIntersecting: isTitleVisible } = useIntersectionObserver({
    initialIsIntersecting: true,
    threshold: 0.1,
    rootMargin: "-60px 0px 0px 0px",
  });

  return (
    <>
      <TitleBar
        title={!isTitleVisible ? title : ""}
        border={!isTitleVisible}
        onNavigate={onNavigate}
      />
      <div className={cn("px-4 pt-16 pb-5 md:px-8 md:pt-8 md:pb-8 lg:px-12 xl:px-16 2xl:px-24", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-bold tracking-tight text-foreground md:text-3xl"
              ref={titleRef}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
            {children && <div className="mt-1.5">{children}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
    </>
  );
}
