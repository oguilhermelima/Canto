import { Skeleton } from "@canto/ui/skeleton";

export default function SearchLoading(): React.JSX.Element {
  return (
    <div className="mx-auto w-full px-4 py-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="mb-6 h-9 w-32" />

        {/* Search input skeleton */}
        <Skeleton className="mb-6 h-12 max-w-2xl rounded-xl" />

        {/* Type tabs skeleton */}
        <div className="flex gap-1">
          <Skeleton className="h-8 w-14 rounded-xl" />
          <Skeleton className="h-8 w-20 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
      </div>

      {/* Results grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            <Skeleton className="aspect-[2/3] w-full" />
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
