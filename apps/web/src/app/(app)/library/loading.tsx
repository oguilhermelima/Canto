import { Skeleton } from "@canto/ui/skeleton";

export default function LibraryLoading(): React.JSX.Element {
  return (
    <div className="mx-auto w-full px-4 py-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <Skeleton className="mb-6 h-9 w-32" />

      {/* Toolbar skeleton */}
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

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 24 }).map((_, i) => (
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
