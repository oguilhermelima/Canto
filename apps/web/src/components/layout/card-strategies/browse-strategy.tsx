"use client";

import { MediaListItem, MediaListItemSkeleton } from "~/components/media/media-list-view";
import { BaseGridCard, BaseGridCardSkeleton } from "./base-grid-card";
import { GRID_COLS } from "~/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "~/components/layout/browse-layout.types";

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  return <BaseGridCard item={item} />;
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
  gridSkeleton: () => <BaseGridCardSkeleton />,
  listSkeleton: () => <MediaListItemSkeleton />,
  gridCols: GRID_COLS,
};
