import { ChevronRight } from "lucide-react";
import type { ElementType } from "react";
import { cn } from "../lib/utils";
import type { LucideIcon } from "lucide-react";

interface SectionTitleProps {
  title: string;
  icon?: LucideIcon;
  seeMorePath?: string;
  action?: React.ReactNode;
  className?: string;
  /** Component used to render the "See more" link. Defaults to `<a>`. Pass Next.js `Link` for soft nav. */
  linkAs?: ElementType;
}

const OUTER_PADDING = "px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24";

export function SectionTitle({
  title,
  icon: Icon,
  seeMorePath,
  action,
  className,
  linkAs: Link = "a",
}: SectionTitleProps): React.JSX.Element {
  const titleNode = (
    <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground md:text-xl">
      {Icon && <Icon size={18} className="text-muted-foreground" />}
      <span className="truncate">{title}</span>
    </h2>
  );

  if (seeMorePath) {
    return (
      <div className={cn(OUTER_PADDING, "pb-4", className)}>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={seeMorePath}
            className="group/section-title -mx-3 flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-muted/50"
          >
            {titleNode}
            <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover/section-title:text-foreground">
              <span className="hidden md:inline">See more</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
          {action}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between pb-4",
        OUTER_PADDING,
        className,
      )}
    >
      <div className="flex items-center gap-1">
        {titleNode}
        {action}
      </div>
    </div>
  );
}
