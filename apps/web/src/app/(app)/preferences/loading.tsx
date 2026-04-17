import { Skeleton } from "@canto/ui/skeleton";

export default function PreferencesLoading(): React.JSX.Element {
  return (
    <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <Skeleton className="mb-1 h-9 w-32" />
      <Skeleton className="mb-8 h-5 w-80" />

      {/* Desktop: sidebar + content */}
      <div className="hidden md:grid md:grid-cols-[240px_1fr] md:gap-10 lg:gap-16">
        {/* Sidebar skeleton */}
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, g) => (
            <div key={g} className="space-y-1.5">
              <Skeleton className="mb-2 h-3 w-16" />
              {Array.from({ length: g === 0 ? 2 : 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
        {/* Content skeleton */}
        <div className="space-y-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Mobile: list skeleton */}
      <div className="space-y-6 md:hidden">
        {Array.from({ length: 3 }).map((_, g) => (
          <div key={g}>
            <Skeleton className="mb-2 h-3 w-20" />
            <div className="overflow-hidden rounded-2xl border border-border">
              {Array.from({ length: g === 0 ? 2 : 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3.5 px-4 py-3.5${i > 0 ? " border-t border-border" : ""}`}
                >
                  <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
