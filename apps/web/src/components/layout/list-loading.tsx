import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";

interface ListLoadingProps {
  count?: number;
  showTabs?: boolean;
  showHeader?: boolean;
  className?: string;
}

export function ListLoading({
  count = 8,
  showTabs = false,
  showHeader = false,
  className,
}: ListLoadingProps): React.JSX.Element {
  return (
    <div className={cn("px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24", className)}>
      {showHeader && (
        <>
          <Skeleton className="mb-1 h-9 w-36" />
          <Skeleton className="mb-8 h-5 w-72" />
        </>
      )}

      {showTabs && (
        <div className="mb-6 flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-xl" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-border/40 p-4"
          >
            <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
