"use client";

import {
  LibraryPlaybackCard,
} from "~/app/(app)/library/_components/library-playback-card";
import type { LibraryPlaybackEntry } from "~/app/(app)/library/_components/library-playback-card";
import { MediaCard, MediaCardSkeleton } from "~/components/media/media-card";
import { RatingBadgeStack } from "~/components/media/rating-badge";
import { GRID_COLS } from "~/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "~/components/layout/browse-layout.types";

function toPlaybackEntry(item: BrowseItem): LibraryPlaybackEntry {
  return {
    id: item.id,
    entryType: item.entryType ?? "playback",
    mediaId: item.id,
    mediaType: item.type,
    title: item.title,
    posterPath: item.posterPath,
    year: item.year ?? null,
    externalId: typeof item.externalId === "number" ? item.externalId : parseInt(String(item.externalId), 10),
    provider: item.provider,
    watchedAt: item.watchedAt ?? new Date(),
    source: item.source ?? null,
    episode: item.episode
      ? { id: item.episode.id ?? null, seasonNumber: item.episode.seasonNumber, number: item.episode.number, title: item.episode.title }
      : null,
    progressPercent: item.progress?.percent ?? null,
    progressValue: item.progress?.value ?? null,
    progressTotal: item.progress?.total ?? null,
    progressUnit: item.progress?.unit ?? null,
    isCompleted: item.isCompleted ?? false,
  };
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function episodeBadgeLabel(item: BrowseItem): string | null {
  if (item.episode?.seasonNumber != null && item.episode?.number != null) {
    return `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}`;
  }
  return null;
}

function buildHoverSubtitle(item: BrowseItem): string | null {
  const epLabel = episodeBadgeLabel(item);
  if (epLabel && item.episode?.title) return `${epLabel} · ${item.episode.title}`;
  if (epLabel) return epLabel;
  return null;
}

function buildHoverExtra(item: BrowseItem): string | null {
  if (!item.progress) return null;
  if (item.progress.unit === "seconds" && item.progress.value > 0) {
    return `${formatDuration(item.progress.value)} / ${formatDuration(item.progress.total)}`;
  }
  if (item.progress.unit === "episodes" && item.progress.value > 0) {
    return `${item.progress.value}/${item.progress.total} ep`;
  }
  if (item.progress.percent >= 100) return "Completed";
  if (item.progress.percent > 0) return `${Math.round(item.progress.percent)}%`;
  return null;
}

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  const epLabel = episodeBadgeLabel(item);

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
      progress={item.progress}
      slots={{
        topLeft: (
          <RatingBadgeStack
            voteAverage={item.voteAverage}
            userRating={item.userRating}
          />
        ),
        topRight: epLabel ? (
          <div className="rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {epLabel}
          </div>
        ) : undefined,
        hoverSubtitle: buildHoverSubtitle(item),
        hoverExtra: buildHoverExtra(item),
      }}
    />
  );
}

function ListCard({ item }: { item: BrowseItem }): React.JSX.Element {
  return <LibraryPlaybackCard entry={toPlaybackEntry(item)} mode="watched" />;
}

function ListSkeleton(): React.JSX.Element {
  return <div className="h-[120px] animate-pulse rounded-2xl bg-muted" />;
}

export const progressStrategy: CardStrategy = {
  name: "progress",
  gridCard: (item) => <GridCard item={item} />,
  listCard: (item) => <ListCard item={item} />,
  gridSkeleton: () => <MediaCardSkeleton />,
  listSkeleton: () => <ListSkeleton />,
  gridCols: GRID_COLS,
};
