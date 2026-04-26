"use client";

import type { LucideIcon } from "lucide-react";
import { PageHeader as BasePageHeader } from "@canto/ui/page-header";
import { TitleBar } from "@/components/layout/titlebar";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
  /** Override the back navigation logic on the mobile sticky title bar. */
  onNavigate?: () => void;
  /** Fallback path when there's no in-app history to pop from. */
  fallback?: string;
};

export function PageHeader({
  title,
  subtitle,
  icon,
  children,
  action,
  tabs,
  className,
  onNavigate,
  fallback,
}: PageHeaderProps): React.JSX.Element {
  return (
    <BasePageHeader
      title={title}
      subtitle={subtitle}
      icon={icon}
      action={action}
      tabs={tabs}
      className={className}
      stickyHeader={(isTitleVisible) => (
        <TitleBar
          title={!isTitleVisible ? title : ""}
          border={!isTitleVisible}
          onNavigate={onNavigate}
          fallback={fallback}
        />
      )}
    >
      {children}
    </BasePageHeader>
  );
}
