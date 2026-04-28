import { Skeleton } from "@canto/ui/skeleton";

export default function LibraryLoading(): React.JSX.Element {
  return (
    <div className="w-full md:pb-12">
      {/* Header */}
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <Skeleton className="mb-1 h-9 w-32" />
        <Skeleton className="mb-6 h-5 w-72" />

        {/* Stats bar */}
        <div className="mb-8 flex gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div>
                <Skeleton className="h-5 w-10" />
                <Skeleton className="mt-1 h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 md:gap-12">
        {/* Watch Next skeleton */}
        <section className="pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-video w-[280px] shrink-0 rounded-xl sm:w-[300px] lg:w-[340px]"
              />
            ))}
          </div>
        </section>

        {/* Upcoming Schedule skeleton */}
        <section className="pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          <Skeleton className="mb-4 h-6 w-44" />
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-video w-[280px] shrink-0 rounded-xl sm:w-[300px] lg:w-[340px]"
              />
            ))}
          </div>
        </section>

        {/* Collections skeleton */}
        <section className="pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-[16/9] w-[260px] shrink-0 rounded-xl sm:w-[280px] lg:w-[300px]"
              />
            ))}
          </div>
        </section>

        {/* History skeleton */}
        <section className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <Skeleton className="mb-4 h-6 w-36" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-xl" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
