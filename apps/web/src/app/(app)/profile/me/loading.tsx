import { Skeleton } from "@canto/ui/skeleton";

export default function ProfileLoading(): React.JSX.Element {
  return (
    <div className="w-full pb-12">
      {/* Profile header */}
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex items-center gap-4 py-8">
          <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>

        {/* Tab bar */}
        <div className="mb-8 flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>

        {/* Grid */}
        <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col">
              <Skeleton className="aspect-[2/3] w-full rounded-xl" />
              <div className="mt-2 space-y-1.5 px-0.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
