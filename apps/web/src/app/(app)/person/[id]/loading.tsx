import { Skeleton } from "@canto/ui/skeleton";

export default function PersonLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero skeleton */}
      <section className="relative w-full">
        <div className="relative h-[350px] w-full overflow-hidden bg-muted md:h-[450px]">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
        </div>
        <div className="relative mx-auto -mt-48 max-w-screen-2xl px-4 pb-8 md:-mt-56 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-end">
            <Skeleton className="h-[240px] w-[240px] rounded-2xl md:h-[280px] md:w-[280px]" />
            <div className="flex flex-col items-center gap-3 pb-2 md:items-start">
              <Skeleton className="h-10 w-64 md:h-12 md:w-80" />
              <Skeleton className="h-5 w-32" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-32 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Biography skeleton */}
      <div className="mx-auto max-w-screen-2xl px-4 pt-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <Skeleton className="mb-4 h-7 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      {/* Carousel skeletons */}
      <div className="mt-12 flex flex-col gap-12 pb-16 md:mt-16 md:gap-16">
        {[0, 1].map((section) => (
          <section key={section}>
            <Skeleton className="mb-4 ml-4 h-7 w-32 md:ml-8 lg:ml-12 xl:ml-16 2xl:ml-24" />
            <div className="flex gap-6 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-[185px] shrink-0">
                  <Skeleton className="aspect-[2/3] w-full rounded-xl" />
                  <div className="mt-2 space-y-1 px-0.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Photos skeleton */}
        <section>
          <Skeleton className="mb-4 ml-4 h-7 w-24 md:ml-8 lg:ml-12 xl:ml-16 2xl:ml-24" />
          <div className="flex gap-4 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[280px] w-[190px] shrink-0 rounded-xl md:h-[340px] md:w-[230px]"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
