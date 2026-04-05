import { Skeleton } from "@canto/ui/skeleton";

export default function ManageLoading(): React.JSX.Element {
  return (
    <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <Skeleton className="mb-1 h-9 w-32" />
      <Skeleton className="mb-8 h-5 w-72" />

      {/* Tabs */}
      <div className="mb-8 flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-xl" />
        ))}
      </div>

      {/* Tab content — settings sections */}
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="mb-8">
          <Skeleton className="mb-1 h-5 w-28" />
          <Skeleton className="mb-4 h-4 w-64" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
