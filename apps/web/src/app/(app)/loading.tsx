import { Skeleton } from "@canto/ui/skeleton";

export default function AppLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen">
      {/* Spotlight hero skeleton */}
      <div className="relative -mt-16 min-h-[90vh] w-full bg-gradient-to-b from-muted/20 to-background xl:min-h-[80vh]">
        <div className="mx-auto flex min-h-[90vh] w-full flex-col justify-end px-4 pb-16 pt-24 md:px-8 lg:px-12 xl:min-h-[80vh] xl:px-16 2xl:px-24">
          <div className="flex max-w-2xl flex-col gap-5">
            <Skeleton className="h-24 w-96 max-w-full" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-16 w-full max-w-2xl" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-36 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Per-section skeletons */}
      <div className="mt-4 flex w-full flex-col gap-8 pb-12 md:mt-12 md:gap-12">
        {/* Featured carousel skeleton (tall poster cards) */}
        <section>
          <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="flex gap-6 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[360px] w-[230px] shrink-0 rounded-xl sm:h-[400px] sm:w-[250px] lg:h-[440px] lg:w-[280px] 2xl:h-[500px] 2xl:w-[320px]"
              />
            ))}
          </div>
        </section>

        {/* Backdrop carousel skeleton (wide landscape cards) */}
        <section>
          <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="flex gap-4 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-video w-[280px] shrink-0 rounded-xl sm:w-[300px] lg:w-[340px] 2xl:w-[380px]"
              />
            ))}
          </div>
        </section>

        {/* Poster carousel skeleton (portrait poster cards) */}
        <section>
          <div className="mb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="flex gap-3 overflow-hidden pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-[2/3] w-[140px] shrink-0 rounded-xl sm:w-[160px] lg:w-[180px]"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
