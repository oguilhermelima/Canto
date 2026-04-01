import { Skeleton } from "@canto/ui/skeleton";

export default function MediaDetailLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero skeleton */}
      <section className="relative w-full">
        {/* Backdrop skeleton */}
        <div className="relative h-[400px] w-full overflow-hidden bg-muted">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>

        {/* Content skeleton */}
        <div className="relative mx-auto -mt-32 max-w-screen-2xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            {/* Poster skeleton */}
            <Skeleton className="mx-auto h-[300px] w-[200px] rounded-xl md:mx-0 md:h-[360px] md:w-[240px]" />

            {/* Info skeleton */}
            <div className="flex-1 space-y-4 pt-4">
              <Skeleton className="mx-auto h-12 w-80 md:mx-0" />
              <Skeleton className="mx-auto h-5 w-48 md:mx-0" />
              <div className="flex justify-center gap-2 md:justify-start">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="flex justify-center gap-2 md:justify-start">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
              <Skeleton className="mx-auto h-20 w-full max-w-2xl md:mx-0" />
              <div className="flex justify-center gap-3 md:justify-start">
                <Skeleton className="h-11 w-40 rounded-xl" />
                <Skeleton className="h-11 w-36 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content skeleton */}
      <div className="mx-auto max-w-screen-2xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        {/* Cast skeleton */}
        <section>
          <Skeleton className="mb-4 h-7 w-32" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[120px] shrink-0">
                <Skeleton className="mb-2 aspect-square w-full rounded-full" />
                <Skeleton className="mx-auto h-4 w-20" />
                <Skeleton className="mx-auto mt-1 h-3 w-16" />
              </div>
            ))}
          </div>
        </section>

        {/* Carousel skeleton */}
        <section>
          <Skeleton className="mb-4 h-7 w-48" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-[2/3] w-[180px] shrink-0 rounded-xl"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
