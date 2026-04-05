import { Skeleton } from "@canto/ui/skeleton";

export default function NotificationsLoading(): React.JSX.Element {
  return (
    <div className="px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Header */}
      <Skeleton className="mb-1 h-9 w-40" />
      <Skeleton className="mb-8 h-5 w-64" />

      {/* Notification list */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/40 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
