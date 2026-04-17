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

export function SectionTitle({
  title,
  icon: Icon,
  seeMorePath,
  action,
  className,
  linkAs: Link = "a",
}: SectionTitleProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground md:text-xl">
          {Icon && <Icon size={18} className="text-muted-foreground" />}
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
