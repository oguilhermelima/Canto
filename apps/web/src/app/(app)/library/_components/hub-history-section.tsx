"use client";

import { useMemo, useRef } from "react";
import { History } from "lucide-react";
import { MediaCard } from "@/components/media/media-card";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import { trpc } from "@/lib/trpc/client";
import { LibraryCarousel } from "./library-carousel";

const CARD_WIDTH_CLASS =
  "w-[140px] shrink-0 sm:w-[180px] lg:w-[220px] 2xl:w-[240px]";

export function HubHistorySection(): React.JSX.Element {
  const initialLimit = useResponsivePageSize({ mobile: 8, tablet: 12, desktop: 18 });
  const lockedRef = useRef(initialLimit);
  const limit = lockedRef.current;
  const { data, isLoading, isError, refetch } =
    trpc.userMedia.getLibraryHistory.useQuery({ limit });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{
      id: string;
      mediaId: string;
      mediaType: string;
      title: string;
      posterPath: string | null;
      year: number | null;
      voteAverage: number | null;
      userRating: number | null;
      externalId: number;
      provider: string;
    }> = [];
    for (const entry of data?.items ?? []) {
      if (seen.has(entry.mediaId)) continue;
      seen.add(entry.mediaId);
      result.push({
        id: entry.id,
        mediaId: entry.mediaId,
        mediaType: entry.mediaType,
        title: entry.title,
        posterPath: entry.posterPath,
        year: entry.year ?? null,
        voteAverage:
          "voteAverage" in entry
            ? (entry as { voteAverage?: number | null }).voteAverage ?? null
            : null,
        userRating:
          "userRating" in entry
            ? (entry as { userRating?: number | null }).userRating ?? null
            : null,
        externalId: entry.externalId,
        provider: entry.provider,
      });
    }
    return result;
  }, [data?.items]);

  return (
    <LibraryCarousel
      title="Recently Watched"
      icon={History}
      seeAllHref="/library/history"
      items={items}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      emptyPreset="emptyContinueWatching"
      renderCard={(item) => (
        <MediaCard
          key={item.mediaId}
          id={item.mediaId}
          externalId={item.externalId}
          provider={item.provider}
          type={item.mediaType as "movie" | "show"}
          title={item.title}
          posterPath={item.posterPath}
          year={item.year}
          voteAverage={item.voteAverage}
          userRating={item.userRating}
          className={CARD_WIDTH_CLASS}
        />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-[2/3]"
    />
  );
}
