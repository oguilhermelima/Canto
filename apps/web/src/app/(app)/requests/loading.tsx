import { Skeleton } from "@canto/ui/skeleton";

export default function RequestsLoading(): React.JSX.Element {
  return (
    <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <Skeleton className="mb-1 h-9 w-32" />
      <Skeleton className="mb-8 h-5 w-72" />

      {/* Tabs */}
      <div className="mb-6 flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-xl" />
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-10 flex-1 max-w-xs rounded-xl" />
        <Skeleton className="h-10 w-20 rounded-xl" />
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>

      {/* Request cards */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/40 p-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
