"use client";

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
    <div className={className}>
      {hasRecommendations && (
        <MediaCarousel
          title="Recommended"
          items={recommendations}
          isLoading={isLoading}
          className="mb-8"
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
