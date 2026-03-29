import { Skeleton } from "@canto/ui/skeleton";

export default function AppLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen">
      {/* Spotlight hero skeleton */}
      <div className="relative -mt-16 min-h-[70vh] w-full bg-gradient-to-b from-muted/20 to-background">
        <div className="relative mx-auto flex min-h-[70vh] w-full flex-col justify-end px-4 pb-16 pt-24 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
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

      {/* Carousel skeletons */}
      <div className="mt-4 flex w-full flex-col gap-12 px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {Array.from({ length: 2 }).map((_, section) => (
          <section key={section}>
            <Skeleton className="mb-4 h-7 w-48" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[160px] shrink-0 overflow-hidden rounded-xl border border-border bg-card"
                >
                  <Skeleton className="aspect-[2/3] w-full" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
