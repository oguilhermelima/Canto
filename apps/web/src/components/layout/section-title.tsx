import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@canto/ui/cn";

interface SectionTitleProps {
  title: string;
  seeMorePath?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionTitle({
  title,
  seeMorePath,
  action,
  className,
}: SectionTitleProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold text-foreground md:text-xl">
          {title}
        </h2>
        {action}
      </div>
      <div className="flex items-center gap-2">
        {seeMorePath && (
          <Link
            href={seeMorePath}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="hidden md:inline">See more</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
