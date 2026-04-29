import { cn } from "@canto/ui/cn";
import { Skeleton } from "@canto/ui/skeleton";

/**
 * Matches the layout of {@link packages/ui/src/components/section-title.tsx}:
 * flex justify-between with responsive horizontal padding, a title bar on the
 * left, and a "see more" chevron stub on the right.
 */
export function SectionTitleSkeleton({
  showSeeMore = true,
  className,
}: {
  showSeeMore?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 py-1 md:py-2">
        <Skeleton className="h-6 w-32 md:h-7 md:w-48" />
        {showSeeMore && <Skeleton className="h-4 w-16" />}
      </div>
    </div>
  );
}

/**
 * Matches {@link apps/web/src/components/media/cards/featured-card.tsx}
 * dimensions so the carousel doesn't shift when data arrives.
 */
export function FeaturedCardSkeleton({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <Skeleton
      className={cn(
        "mt-1 shrink-0 rounded-xl",
        "h-[360px] sm:h-[400px] lg:h-[440px] 2xl:h-[500px]",
        "w-[230px] sm:w-[250px] lg:w-[280px] 2xl:w-[320px]",
        className,
      )}
    />
  );
}

/**
 * Section title placeholder + a horizontally-scrolling row of card
 * placeholders. Matches the scroll container classes used by home carousels
 * so the paint hand-off is frame-perfect.
 */
export function CarouselRowSkeleton({
  count = 8,
  card,
  showSeeMore = true,
  className,
}: {
  count?: number;
  card: React.ReactNode;
  showSeeMore?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={className}>
      <SectionTitleSkeleton showSeeMore={showSeeMore} />
      <div className="flex gap-6 overflow-hidden pb-4 pl-4 md:pl-8 lg:pl-12 xl:pl-16 2xl:pl-24">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="shrink-0">
            {card}
          </div>
        ))}
      </div>
    </section>
  );
}
