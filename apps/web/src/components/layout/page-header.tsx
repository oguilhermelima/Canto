"use client";

import { useIntersectionObserver } from "usehooks-ts";
import { TitleBar } from "~/components/layout/titlebar";
import { cn } from "@canto/ui/cn";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, children, className }: PageHeaderProps): React.JSX.Element {
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
      />
      <div className={cn("px-4 pt-16 pb-5 md:px-8 md:pt-8 md:pb-8 lg:px-12 xl:px-16 2xl:px-24", className)}>
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
    </>
  );
}
