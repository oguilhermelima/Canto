"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { useGoBack } from "@/hooks/use-go-back";

export type TitleBarProps = {
  title?: string;
  className?: string;
  border?: boolean;
  variant?: "back" | "none";
  /** Override the back navigation. */
  onNavigate?: () => void;
  /** Fallback path used when there's no in-app history to pop. */
  fallback?: string;
};

export function TitleBar({
  title,
  className,
  border = true,
  variant = "back",
  onNavigate,
  fallback,
}: TitleBarProps): React.JSX.Element {
  const goBack = useGoBack(fallback);

  return (
    <div
      className={cn(
        "sticky top-0 z-40 w-full bg-background transition-transform duration-300 md:hidden",
        border && "border-b border-border",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-1 px-2">
        {variant === "back" && (
          <button
            type="button"
            onClick={onNavigate ?? goBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-foreground"
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
