import { Skeleton } from "@canto/ui/skeleton";

export default function StatusLoading(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8 px-4 pb-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <div>
        <Skeleton className="mb-1 h-9 w-24" />
        <Skeleton className="h-5 w-64" />
      </div>

      {/* System status cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/40 p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Version & settings */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>

      {/* Active downloads */}
      <div>
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
