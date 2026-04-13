import type { ReactNode } from "react";

/* ─── View Mode ─── */

export type ViewMode = "grid" | "list";

/* ─── BrowseItem: unified item type all pages normalize to ─── */

export interface BrowseItem {
  /** Stable key for React (e.g. mediaId or `${provider}-${externalId}`) */
  id: string;
  externalId: number | string;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;

  /* Common optional */
  year?: number | null;
  voteAverage?: number | null;
  backdropPath?: string | null;
  overview?: string | null;
  popularity?: number | null;

  /* Progress (continue-watching, watch-next) */
  progress?: {
    percent: number;
    value: number;
    total: number;
    unit: "seconds" | "episodes";
  } | null;
  isCompleted?: boolean | null;
  entryType?: "history" | "playback";

  /* Episode info */
  episode?: {
    id?: string | null;
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;

  /* History */
  watchedAt?: Date | string | null;
  source?: string | null;

  /* Upcoming */
  releaseAt?: Date | string | null;

  /* Collection votes */
  totalRating?: number;
  voteCount?: number;
}

/* ─── Card Strategy ─── */

export interface CardStrategy {
  name: string;
  gridCard: (item: BrowseItem) => ReactNode;
  listCard: (item: BrowseItem) => ReactNode;
  gridSkeleton: () => ReactNode;
  listSkeleton: () => ReactNode;
  /** Override grid column classes. Falls back to BrowseLayout defaults. */
  gridCols?: { default: string; compact: string };
}

/* ─── Grid Columns ─── */

export const GRID_COLS = {
  default: "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 5xl:grid-cols-7 7xl:grid-cols-10",
  compact: "grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 5xl:grid-cols-6 7xl:grid-cols-9",
};

/* ─── Filter Preset ─── */

export type FilterPreset = "tmdb" | "library";

/* ─── Browse Menu ─── */

export interface BrowseMenuItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  className?: string;
}

export interface BrowseMenuGroup {
  label: string;
  items: BrowseMenuItem[];
}
