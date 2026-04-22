"use client";

import { MediaCard, MediaCardSkeleton } from "@/components/media/media-card";
import { MediaListItem, MediaListItemSkeleton } from "@/components/media/media-list-view";
import { RatingBadgeStack } from "@/components/media/rating-badge";
import { GRID_COLS } from "@/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "@/components/layout/browse-layout.types";

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  return (
    <MediaCard
      id={item.id}
      externalId={item.externalId}
      provider={item.provider}
      type={item.type}
      title={item.title}
      posterPath={item.posterPath}
      year={item.year}
      voteAverage={item.voteAverage}
      hideMetaRating
      slots={{
        topLeft: <RatingBadgeStack voteAverage={item.voteAverage} />,
      }}
    />
  );
}

function ListCard({ item }: { item: BrowseItem }): React.JSX.Element {
  return (
    <MediaListItem
      item={{
        externalId: String(item.externalId),
        provider: item.provider,
        type: item.type,
        title: item.title,
        posterPath: item.posterPath,
        year: item.year,
        voteAverage: item.voteAverage,
        overview: item.overview,
      }}
    />
  );
}

export const browseStrategy: CardStrategy = {
  name: "browse",
  gridCard: (item) => <GridCard item={item} />,
  listCard: (item) => <ListCard item={item} />,
  gridSkeleton: () => <MediaCardSkeleton />,
  listSkeleton: () => <MediaListItemSkeleton />,
  gridCols: GRID_COLS,
};
