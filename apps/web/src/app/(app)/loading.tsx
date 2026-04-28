import { Skeleton } from "@canto/ui/skeleton";
import { BackdropCardSkeleton } from "@/components/media/backdrop-card";
import {
  CarouselRowSkeleton,
  FeaturedCardSkeleton,
} from "@/components/media/skeletons";
import { MediaCardSkeleton } from "@/components/media/media-card";

/**
 * Spotlight hero placeholder that mirrors SpotlightHero geometry:
 * min-h-[80vh] container, `pt-24 pb-8` inner, content block at the
 * bottom-left with logo/title + meta pills + overview lines + action row.
 */
function SpotlightSkeleton(): React.JSX.Element {
  return (
    <section className="relative -mt-16 w-full bg-gradient-to-b from-muted/20 to-background">
      <div className="flex min-h-[80vh] w-full items-end px-4 pt-24 pb-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex w-full max-w-2xl flex-col gap-5">
          <Skeleton className="h-16 w-[min(24rem,70%)] md:h-20" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-36 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AppLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen">
      <SpotlightSkeleton />

      <div className="mt-4 flex w-full flex-col gap-12 pb-12 md:mt-12">
        <CarouselRowSkeleton count={8} card={<FeaturedCardSkeleton />} />
        <CarouselRowSkeleton
          count={6}
          card={
            <BackdropCardSkeleton className="w-[280px] sm:w-[300px] lg:w-[340px] 2xl:w-[380px]" />
          }
        />
        <CarouselRowSkeleton
          count={8}
          card={
            <MediaCardSkeleton className="w-[180px] sm:w-[200px] lg:w-[220px] 2xl:w-[240px]" />
          }
        />
      </div>
    </div>
  );
}
