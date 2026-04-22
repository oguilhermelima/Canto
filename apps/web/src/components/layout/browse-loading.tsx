import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";
import { MediaCardSkeleton } from "@/components/media/media-card";
import { GRID_COLS } from "./browse-layout.types";

interface BrowseLoadingProps {
  /** Show the filter sidebar placeholder (desktop only). */
  sidebar?: boolean;
  /** Render a search input row above the TabBar. */
  searchInput?: boolean;
  /** Show the TabBar pill row (All / Movies / TV Shows style). */
  tabs?: boolean;
  /** How many grid cards to render. */
  count?: number;
  className?: string;
}

/**
 * Mirrors BrowseLayout's structure — optional sidebar on the left, optional
 * search input + TabBar toolbar on top, then a grid of MediaCardSkeletons
 * sized with the same GRID_COLS classes the live layout uses. Keeps the
 * loading.tsx and in-component skeletons from fighting each other.
 */
export function BrowseLoading({
  sidebar = true,
  searchInput = false,
  tabs = true,
  count = 18,
  className,
}: BrowseLoadingProps): React.JSX.Element {
  return (
    <div className={cn("w-full pb-12", className)}>
      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {sidebar && (
          <div className="mr-4 hidden w-[20rem] shrink-0 md:block lg:mr-8">
            <div className="flex flex-col gap-4 pt-3">
              <Skeleton className="h-9 w-full rounded-xl" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {searchInput && (
            <div className="mb-3">
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          )}

          {tabs && (
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-9 w-12 rounded-xl" />
              <div className="flex items-center gap-1 rounded-full bg-muted/40 p-1">
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
            </div>
          )}

          <div className={cn("grid gap-6", GRID_COLS.default)}>
            {Array.from({ length: count }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
