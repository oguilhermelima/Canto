"use client";

import { FadeImage } from "@/components/ui/fade-image";
import { tmdbBackdropLoader } from "@/lib/tmdb-image";
import type { SpotlightItem } from "./spotlight-hero";

interface SpotlightBackdropProps {
  item: SpotlightItem | null;
  slideKey: number;
  isLoading: boolean;
}

export function SpotlightBackdrop({
  item,
  slideKey,
  isLoading,
}: SpotlightBackdropProps): React.JSX.Element {
  if (item?.backdropPath) {
    return (
      <div key={slideKey} className="absolute inset-0 overflow-hidden">
        <FadeImage
          loader={tmdbBackdropLoader}
          src={item.backdropPath}
          alt=""
          fill
          className="object-cover object-[50%_30%]"
          fadeDuration={800}
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background from-5% via-background/40 via-35% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-background/20 to-transparent" />
      </div>
    );
  }
  return isLoading ? (
    <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
  ) : (
    <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-background" />
  );
}
