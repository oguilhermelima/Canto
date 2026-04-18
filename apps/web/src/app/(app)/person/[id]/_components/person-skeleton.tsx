import { Skeleton } from "@canto/ui/skeleton";

export function PersonPageSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <section className="relative -mt-16 w-full">
        <div className="relative h-[340px] w-full overflow-hidden bg-muted md:h-[550px]">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        </div>
        <div className="relative mx-auto -mt-40 w-full px-4 pb-6 md:-mt-64 md:px-8 md:pb-10 lg:px-12 xl:px-16 2xl:px-24">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-end md:gap-8">
            <Skeleton className="h-[160px] w-[160px] rounded-xl md:h-[300px] md:w-[300px]" />
            <div className="flex min-w-0 flex-col items-center gap-3 md:items-start md:pb-4">
              <Skeleton className="h-3 w-20 md:h-4" />
              <Skeleton className="h-9 w-64 md:h-14 md:w-96" />
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 md:justify-start">
                <Skeleton className="h-3.5 w-28 md:h-4" />
                <Skeleton className="h-3.5 w-36 md:h-4" />
              </div>
              <div className="flex flex-wrap justify-center gap-2 md:justify-start md:gap-3">
                <Skeleton className="h-7 w-24 rounded-full md:h-9 md:w-28" />
                <Skeleton className="h-7 w-28 rounded-full md:h-9 md:w-32" />
                <Skeleton className="h-7 w-16 rounded-full md:h-9 md:w-20" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full px-4 pt-4 md:px-8 md:pt-6 lg:px-12 xl:px-16 2xl:px-24">
        <Skeleton className="mb-3 h-7 w-32" />
        <div className="max-w-4xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      <div className="mx-auto mt-8 w-full px-4 md:mt-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <Skeleton className="mb-6 h-7 w-40 md:mb-10" />
        <div className="ml-8 border-l-2 border-border">
          {Array.from({ length: 4 }).map((_, gi) => (
            <div key={gi} className="mb-10">
              <div className="-ml-[13px] mb-4 flex items-center gap-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-8 w-16" />
              </div>
              <div className="ml-10 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3">
                    <Skeleton className="h-[90px] w-[60px] rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
