import { Skeleton } from "@canto/ui/skeleton";
import { MediaCardSkeleton } from "@/components/media/media-card";

const GRID_COLS =
  "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6";

export function ProfileHeaderSkeleton(): React.JSX.Element {
  return (
    <div className="px-5 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <div className="flex items-center gap-4 py-8">
        <Skeleton className="h-20 w-20 shrink-0 rounded-full md:h-24 md:w-24" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ProfileTabBarSkeleton(): React.JSX.Element {
  return (
    <div className="flex gap-2 overflow-x-auto px-5 pb-4 scrollbar-none md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
      ))}
    </div>
  );
}

export function ProfileMediaGridSkeleton({
  count = 12,
}: {
  count?: number;
}): React.JSX.Element {
  return (
    <div className={`grid gap-6 ${GRID_COLS}`}>
      {Array.from({ length: count }).map((_, i) => (
        <MediaCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Full-page profile skeleton — header + tab bar + generic media grid.
 * Used both by the segment-level loading.tsx and the session-pending
 * branch of profile/me/page.tsx to avoid a blank flash.
 */
export function ProfilePageSkeleton(): React.JSX.Element {
  return (
    <div className="w-full pb-12">
      <ProfileHeaderSkeleton />
      <ProfileTabBarSkeleton />
      <div className="px-5 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ProfileMediaGridSkeleton />
      </div>
    </div>
  );
}
