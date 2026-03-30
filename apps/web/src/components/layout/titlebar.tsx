"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@canto/ui/cn";

export type TitleBarProps = {
  title?: string;
  className?: string;
  border?: boolean;
  variant?: "back" | "none";
  onNavigate?: () => void;
};

export function TitleBar({
  title,
  className,
  border = true,
  variant = "back",
  onNavigate,
}: TitleBarProps): React.JSX.Element {
  const router = useRouter();

  const handleBack = (): void => {
    const fromSameOrigin = (() => {
      try {
        return !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    })();

    if (fromSameOrigin) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-40 w-full bg-background transition-transform duration-300 md:hidden",
        border && "border-b border-border/60",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-1 px-4">
        {variant === "back" && (
          <button
            type="button"
            onClick={onNavigate ?? handleBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <p
          className={cn(
            "text-base font-medium transition-all duration-300 ease-in-out",
            title ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
          )}
        >
          {title}
        </p>
      </div>
    </div>
  );
}
