"use client";

import { useRouter } from "next/navigation";
import { PageHeader as BasePageHeader } from "@canto/ui/page-header";
import { TitleBar } from "~/components/layout/titlebar";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  onNavigate?: () => void;
};

export function PageHeader({ title, subtitle, children, action, className, onNavigate }: PageHeaderProps): React.JSX.Element {
  const router = useRouter();

  const handleBack = onNavigate ?? (() => {
    try {
      if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
        router.back();
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
    }
  });

  return (
    <BasePageHeader
      title={title}
      subtitle={subtitle}
      action={action}
      className={className}
      onBack={handleBack}
      stickyHeader={(isTitleVisible) => (
        <TitleBar
          title={!isTitleVisible ? title : ""}
          border={!isTitleVisible}
          onNavigate={onNavigate}
        />
      )}
    >
      {children}
    </BasePageHeader>
  );
}
