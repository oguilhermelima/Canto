"use client";

import { cn } from "@canto/ui/cn";
import { MediaCarousel } from "./media-carousel";

interface MediaItem {
  id?: string;
  externalId?: string;
  provider?: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year?: number | null;
  voteAverage?: number | null;
}

interface SimilarSectionProps {
  similar: MediaItem[];
  recommendations: MediaItem[];
  isLoading?: boolean;
  className?: string;
}

export function SimilarSection({
  similar,
  recommendations,
  isLoading = false,
  className,
}: SimilarSectionProps): React.JSX.Element {
  const hasSimilar = similar.length > 0 || isLoading;
  const hasRecommendations = recommendations.length > 0 || isLoading;

  if (!hasSimilar && !hasRecommendations) {
    return <></>;
  }

  return (
    <div className={cn("flex flex-col gap-16 md:gap-20", className)}>
      {hasRecommendations && (
        <MediaCarousel
          title="Recommended"
          items={recommendations}
          isLoading={isLoading}
        />
      )}

      {hasSimilar && (
        <MediaCarousel
          title="Similar"
          items={similar}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
