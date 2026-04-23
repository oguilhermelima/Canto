"use client";

import { MediaCard, MediaCardSkeleton } from "@/components/media/media-card";
import { MediaListItem, MediaListItemSkeleton } from "@/components/media/media-list-view";
import { MembershipBadges } from "@/components/media/membership-badges";
import { RatingBadgeStack } from "@/components/media/rating-badge";
import { GRID_COLS } from "@/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "@/components/layout/browse-layout.types";

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  return (
    <div className="relative">
      <MediaCard
        id={item.id}
        externalId={item.externalId}
        provider={item.provider}
        type={item.type}
        title={item.title}
        posterPath={item.posterPath}
        year={item.year}
        voteAverage={item.voteAverage}
        slots={{
          topLeft: (
            <RatingBadgeStack
              voteAverage={item.voteAverage}
              userRating={item.userRating}
              membersAvg={item.membersAvg}
              membersCount={item.voteCount}
            />
          ),
        }}
      />
      <MembershipBadges membership={item.membership} variant="grid" />
    </div>
  );
}

function ListCard({ item }: { item: BrowseItem }): React.JSX.Element {
  const showBadges =
    !!item.membership &&
    (item.membership.inWatchlist ||
      item.membership.otherCollections.length > 0);

  return (
    <div className="relative flex w-full items-center gap-3 pr-12">
      <div className="min-w-0 flex-1">
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
      </div>
      {showBadges && (
        <MembershipBadges
          membership={item.membership}
          variant="list"
          className="shrink-0"
        />
      )}
    </div>
  );
}

export const collectionStrategy: CardStrategy = {
  name: "collection",
  gridCard: (item) => <GridCard item={item} />,
  listCard: (item) => <ListCard item={item} />,
  gridSkeleton: () => <MediaCardSkeleton />,
  listSkeleton: () => <MediaListItemSkeleton />,
  gridCols: GRID_COLS,
};
