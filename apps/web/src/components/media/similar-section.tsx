"use client";

import { cn } from "@canto/ui/cn";
import { Sparkles, Shapes } from "lucide-react";
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
    <div className={cn("flex flex-col gap-12 md:gap-16", className)}>
      {hasRecommendations && (
        <MediaCarousel
          title="Recommended"
          icon={Sparkles}
          items={recommendations}
          isLoading={isLoading}
        />
      )}

      {hasSimilar && (
        <MediaCarousel
          title="Similar"
          icon={Shapes}
          items={similar}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
