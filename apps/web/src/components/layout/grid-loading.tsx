import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";

interface GridLoadingProps {
  count?: number;
  aspectRatio?: string;
  showToolbar?: boolean;
  showHeader?: boolean;
  className?: string;
}

export function GridLoading({
  count = 24,
  aspectRatio = "aspect-[2/3]",
  showToolbar = false,
  showHeader = false,
  className,
}: GridLoadingProps): React.JSX.Element {
  return (
    <div className={cn("mx-auto w-full px-4 py-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24", className)}>
      {showHeader && <Skeleton className="mb-6 h-9 w-32" />}

      {showToolbar && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="hidden h-9 w-24 rounded-xl md:block" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-8 w-14 rounded-xl" />
              <Skeleton className="h-8 w-24 rounded-xl" />
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-[200px] rounded-xl" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            <Skeleton className={cn(aspectRatio, "w-full")} />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
