import { Skeleton } from "@canto/ui/skeleton";

export default function MediaDetailLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen">
      {/* Hero skeleton */}
      <section className="relative min-h-[60vh] w-full overflow-hidden bg-muted/30">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="relative px-4 pb-10 pt-24 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-screen-2xl flex-col gap-8 md:flex-row md:items-end">
            {/* Poster skeleton */}
            <Skeleton className="mx-auto h-[300px] w-[200px] rounded-xl md:mx-0 md:h-[360px] md:w-[240px]" />

            {/* Info skeleton */}
            <div className="flex-1 space-y-4">
              <Skeleton className="mx-auto h-12 w-80 md:mx-0" />
              <Skeleton className="mx-auto h-5 w-48 md:mx-0" />
              <div className="flex justify-center gap-2 md:justify-start">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="flex justify-center gap-2 md:justify-start">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-14" />
              </div>
              <Skeleton className="mx-auto h-20 w-full max-w-2xl md:mx-0" />
              <div className="flex justify-center gap-3 md:justify-start">
                <Skeleton className="h-11 w-40" />
                <Skeleton className="h-11 w-36" />
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
                className="aspect-[2/3] w-[180px] shrink-0 rounded-lg"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
