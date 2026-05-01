"use client";

import type { SectionItem } from "./section-item";
import { SpotlightHero } from "./spotlight/spotlight-hero";
import type { SpotlightItem } from "./spotlight/spotlight-hero";
import { FeaturedCarousel } from "@/components/media/featured-carousel";
import { BackdropCarousel } from "@/components/media/backdrop-carousel";
import { MediaCarousel } from "@/components/media/media-carousel";
import { SectionTitle } from "@canto/ui/section-title";
import { StateMessage } from "@canto/ui/state-message";
import { mediaHref } from "@/lib/media-href";
import { useSectionDedup } from "./dedup-context";

interface DynamicSectionProps {
  sectionId: string;
  style: string;
  title: string;
  seeAllHref?: string;
  items: SectionItem[];
  isLoading: boolean;
  isError?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  emptyPreset?: string;
  excludeFromDedup?: boolean;
}

/* ── Mappers: SectionItem[] → component-specific shapes ── */

function toSpotlightItems(items: SectionItem[]): SpotlightItem[] {
  const result: SpotlightItem[] = [];
  for (const item of items) {
    if (!item.backdropPath) continue;
    result.push({
      externalId: typeof item.externalId === "string" ? parseInt(item.externalId, 10) : item.externalId,
      provider: item.provider,
      type: item.type,
      title: item.title,
      overview: item.overview ?? undefined,
      year: item.year ?? undefined,
      voteAverage: item.voteAverage ?? undefined,
      backdropPath: item.backdropPath,
      logoPath: item.logoPath ?? null,
      genres: item.genres ?? [],
      genreIds: item.genreIds ?? [],
    });
  }
  return result;
}

function toBackdropItems(items: SectionItem[]) {
  return items
    .filter((item) => item.backdropPath)
    .map((item) => ({
      externalId: String(item.externalId),
      provider: item.provider,
      type: item.type,
      title: item.title,
      backdropPath: item.backdropPath,
      year: item.year ?? undefined,
      voteAverage: item.voteAverage ?? undefined,
      popularity: item.popularity,
      releaseDate: item.releaseDate,
      progress: item.progress,
    }));
}

function toFeaturedItems(items: SectionItem[]) {
  return items.map((item) => ({
    externalId: item.externalId,
    provider: item.provider,
    type: item.type,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    logoPath: item.logoPath,
    trailerKey: item.trailerKey,
    year: item.year,
    voteAverage: item.voteAverage,
    overview: item.overview,
  }));
}

function toPosterItems(items: SectionItem[]) {
  return items.map((item) => ({
    id: undefined as string | undefined,
    type: item.type,
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    voteAverage: item.voteAverage,
    externalId: String(item.externalId),
    provider: item.provider,
    href: mediaHref(item.provider, item.externalId, item.type),
    progress: item.progress,
  }));
}

/* ── Component ── */

export function DynamicSection({
  sectionId,
  style,
  title,
  seeAllHref,
  items,
  isLoading,
  isError = false,
  isFetchingMore = false,
  onLoadMore,
  onRetry,
  emptyPreset,
  excludeFromDedup = false,
}: DynamicSectionProps): React.JSX.Element | null {
  const filteredItems = useSectionDedup(sectionId, items, {
    enabled: !excludeFromDedup,
  });

  if (isError) {
    return (
      <section>
        <SectionTitle title={title} />
        <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <StateMessage preset="error" onRetry={onRetry} minHeight="200px" />
        </div>
      </section>
    );
  }

  if (!isLoading && filteredItems.length === 0) {
    if (emptyPreset) {
      return (
        <section>
          <SectionTitle title={title} />
          <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <StateMessage preset={emptyPreset as "emptyWatchlist"} minHeight="200px" />
          </div>
        </section>
      );
    }
    return null;
  }

  switch (style) {
    case "spotlight":
      return (
        <SpotlightHero
          items={toSpotlightItems(filteredItems)}
          isLoading={isLoading}
          isError={isError}
          onRetry={onRetry}
        />
      );

    case "large_video":
      return (
        <FeaturedCarousel
          title={title}
          seeAllHref={seeAllHref}
          items={toFeaturedItems(filteredItems)}
          isLoading={isLoading}
          isFetchingMore={isFetchingMore}
          onLoadMore={onLoadMore}
        />
      );

    case "card":
      return (
        <BackdropCarousel
          title={title}
          seeAllHref={seeAllHref}
          items={toBackdropItems(filteredItems)}
          isLoading={isLoading}
          isFetchingMore={isFetchingMore}
          onLoadMore={onLoadMore}
          badgeStrategy="auto"
        />
      );

    case "cover":
      return (
        <MediaCarousel
          title={title}
          seeAllHref={seeAllHref}
          items={toPosterItems(filteredItems)}
          isLoading={isLoading}
        />
      );

    default:
      return null;
  }
}
