"use client";

import { MediaListItem, MediaListItemSkeleton } from "~/components/media/media-list-view";
import { BaseGridCard, BaseGridCardSkeleton } from "./base-grid-card";
import { GRID_COLS } from "~/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "~/components/layout/browse-layout.types";

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  const badge = item.totalRating != null && item.voteCount != null && item.voteCount > 0 ? (
    <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5">
      <span className="text-xs font-bold text-primary-foreground">{item.totalRating}</span>
      <span className="text-xs text-primary-foreground/70">({item.voteCount})</span>
    </div>
  ) : undefined;

  return <BaseGridCard item={item} badge={badge} />;
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
        totalRating: item.totalRating,
        voteCount: item.voteCount,
      }}
    />
  );
}

export const collectionStrategy: CardStrategy = {
  name: "collection",
  gridCard: (item) => <GridCard item={item} />,
  listCard: (item) => <ListCard item={item} />,
  gridSkeleton: () => <BaseGridCardSkeleton />,
  listSkeleton: () => <MediaListItemSkeleton />,
  gridCols: GRID_COLS,
};
