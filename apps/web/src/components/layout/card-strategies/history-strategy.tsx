"use client";

import {
  LibraryPlaybackCard,
} from "@/app/(app)/library/_components/library-playback-card";
import type { LibraryPlaybackEntry } from "@/app/(app)/library/_components/library-playback-card";
import { MediaCard, MediaCardSkeleton } from "@/components/media/media-card";
import { GRID_COLS } from "@/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "@/components/layout/browse-layout.types";

function toPlaybackEntry(item: BrowseItem): LibraryPlaybackEntry {
  return {
    id: item.id,
    entryType: item.entryType ?? "history",
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
    isCompleted: item.isCompleted ?? null,
  };
}

function formatWatchedDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function episodeLabel(item: BrowseItem): string | null {
  if (
    item.episode?.seasonNumber !== null &&
    item.episode?.seasonNumber !== undefined &&
    item.episode.number !== null
  ) {
    const ep = `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}`;
    return item.episode.title ? `${ep} · ${item.episode.title}` : ep;
  }
  return null;
}

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  const watchedLabel = formatWatchedDate(item.watchedAt);
  const epLabel = episodeLabel(item);

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
      userRating={item.userRating}
      progress={item.progress}
      slots={{
        subtitle: epLabel,
        extra: watchedLabel ? `Watched ${watchedLabel}` : undefined,
      }}
    />
  );
}

function ListCard({ item }: { item: BrowseItem }): React.JSX.Element {
  return <LibraryPlaybackCard entry={toPlaybackEntry(item)} mode="history" />;
}

function ListSkeleton(): React.JSX.Element {
  return <div className="h-[120px] animate-pulse rounded-2xl bg-muted" />;
}

export const historyStrategy: CardStrategy = {
  name: "history",
  gridCard: (item) => <GridCard item={item} />,
  listCard: (item) => <ListCard item={item} />,
  gridSkeleton: () => <MediaCardSkeleton />,
  listSkeleton: () => <ListSkeleton />,
  gridCols: GRID_COLS,
};
