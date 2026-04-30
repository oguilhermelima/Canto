"use client";

import { useMemo, useState } from "react";
import { Server } from "lucide-react";
import { MediaCard } from "@/components/media/media-card";
import { useResponsivePageSize } from "@/hooks/use-responsive-page-size";
import { trpc } from "@/lib/trpc/client";
import { LibraryCarousel } from "./library-carousel";

const CARD_WIDTH_CLASS =
  "w-[140px] shrink-0 sm:w-[180px] lg:w-[220px] 2xl:w-[240px]";

export function HubServerLibrarySection(): React.JSX.Element {
  const initialLimit = useResponsivePageSize({ mobile: 8, tablet: 12, desktop: 18 });
  const [limit] = useState(initialLimit);
  const query = trpc.list.getBySlug.useQuery(
    { slug: "server-library", limit },
    { staleTime: 60_000 },
  );

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return (
    <LibraryCarousel
      title="Server Library"
      icon={Server}
      seeAllHref="/collection/server-library"
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      emptyPreset="emptyServerLibrary"
      renderCard={(item) => (
        <MediaCard
          key={item.media.id}
          id={item.media.id}
          externalId={String(item.media.externalId)}
          provider={item.media.provider}
          type={item.media.type as "movie" | "show"}
          title={item.media.title}
          posterPath={item.media.posterPath}
          year={item.media.year ?? undefined}
          voteAverage={item.media.voteAverage ?? undefined}
          userRating={item.userRating}
          className={CARD_WIDTH_CLASS}
        />
      )}
      cardWidthClass={CARD_WIDTH_CLASS}
      aspectRatioClass="aspect-[2/3]"
    />
  );
}
