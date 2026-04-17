export type TrackingStatus =
  | "none"
  | "planned"
  | "watching"
  | "completed"
  | "dropped";
export type WatchScope = "movie" | "show" | "season" | "episode";
export type ModalTab = "track" | "history";
export type WatchedAtMode =
  | "just_now"
  | "release_date"
  | "other_date"
  | "unknown_date";
export type BulkSelectionMode = "all" | "select";

export interface WatchEpisode {
  id: string;
  seasonNumber: number;
  number: number;
  title?: string | null;
  airDate?: string | null;
}

export interface WatchSeason {
  number: number;
  episodes: WatchEpisode[];
}

export interface UserMediaStatePayload {
  mediaId: string;
  trackingStatus: TrackingStatus;
  rating: number | null;
  isFavorite: boolean;
  isHidden: boolean;
  progress: number;
  isCompleted: boolean;
  lastWatchedAt: Date | null;
  source: string | null;
}

export interface WatchHistoryEntry {
  id: string;
  episodeId: string | null;
  watchedAt: Date | string;
  source: string | null;
}

export interface HistoryGroupItem {
  entry: WatchHistoryEntry;
  label: string;
}

export interface HistoryGroup {
  key: string;
  title: string;
  items: HistoryGroupItem[];
}

export interface WatchTrackingButtonProps {
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  trackingStatus?: TrackingStatus;
  seasons?: WatchSeason[];
  className?: string;
}

export interface MultiSelectOption {
  value: string;
  label: string;
}
