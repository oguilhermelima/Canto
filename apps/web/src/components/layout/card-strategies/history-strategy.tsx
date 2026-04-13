"use client";

import { cn } from "@canto/ui/cn";
import {
  LibraryPlaybackCard,
} from "~/app/(app)/library/_components/library-playback-card";
import type { LibraryPlaybackEntry } from "~/app/(app)/library/_components/library-playback-card";
import { BaseGridCard, BaseGridCardSkeleton } from "./base-grid-card";
import { GRID_COLS } from "~/components/layout/browse-layout.types";
import type { CardStrategy, BrowseItem } from "~/components/layout/browse-layout.types";

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

function statusBadge(item: BrowseItem): { label: string; className: string } | null {
  if (item.entryType === "playback" && item.isCompleted === false) {
    return { label: "In progress", className: "bg-amber-500/15 text-amber-500" };
  }
  if (item.isCompleted === true || (item.progress?.percent ?? 0) >= 100) {
    return { label: "Watched", className: "bg-emerald-500/15 text-emerald-500" };
  }
  return { label: "Logged", className: "bg-muted text-muted-foreground" };
}

function formatWatchedDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function buildSubtitle(item: BrowseItem): string | null {
  if (item.episode?.seasonNumber != null && item.episode?.number != null) {
    const ep = `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.number).padStart(2, "0")}`;
    return item.episode.title ? `${ep} · ${item.episode.title}` : ep;
  }
  return null;
}

function GridCard({ item }: { item: BrowseItem }): React.JSX.Element {
  const badge = statusBadge(item);
  const badgeNode = badge ? (
    <div className={cn("absolute left-1.5 top-1.5 z-10 rounded-lg px-2 py-0.5 backdrop-blur-sm", badge.className)}>
      <span className="text-xs font-semibold">{badge.label}</span>
    </div>
  ) : undefined;

  return (
    <BaseGridCard
      item={item}
      badge={badgeNode}
      subtitle={buildSubtitle(item)}
      extra={formatWatchedDate(item.watchedAt)}
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
  gridSkeleton: () => <BaseGridCardSkeleton />,
  listSkeleton: () => <ListSkeleton />,
  gridCols: GRID_COLS,
};
