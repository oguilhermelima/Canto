export type TrackingStatus =
  | "none"
  | "planned"
  | "watching"
  | "completed"
  | "dropped";
export type WatchedAtMode =
  | "just_now"
  | "release_date"
  | "other_date"
  | "unknown_date";
export type MediaType = "movie" | "show";
export type ContinueWatchingSource = "jellyfin" | "plex" | "trakt";
export type ServerSource = "jellyfin" | "plex";
export type ManualWatchSource = "manual" | "release" | "unknown";

export function parseDateLike(
  value: string | Date | null | undefined,
): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isReleasedOnOrBefore(
  value: string | Date | null | undefined,
  now: Date,
): boolean {
  const parsed = parseDateLike(value);
  return !parsed || parsed.getTime() <= now.getTime();
}

export function hasConfirmedPastAirDate(
  value: string | Date | null | undefined,
  now: Date,
): boolean {
  const parsed = parseDateLike(value);
  return !!parsed && parsed.getTime() <= now.getTime();
}

export function resolveWatchedAt(params: {
  mode: WatchedAtMode;
  customDate: Date | null;
  mediaReleaseDate: Date | null;
  episodeAirDate: Date | null;
}): Date {
  const now = new Date();
  switch (params.mode) {
    case "other_date":
      return params.customDate ?? now;
    case "release_date":
      return params.episodeAirDate ?? params.mediaReleaseDate ?? now;
    case "unknown_date":
      return now;
    case "just_now":
    default:
      return now;
  }
}

export function sourceForMode(mode: WatchedAtMode): ManualWatchSource {
  if (mode === "release_date") return "release";
  if (mode === "unknown_date") return "unknown";
  return "manual";
}

export function isMediaType(value: string): value is MediaType {
  return value === "movie" || value === "show";
}

export function isServerSource(source: string | null): source is ServerSource {
  return source === "jellyfin" || source === "plex";
}

export function isContinueWatchingSource(
  source: string | null,
): source is ContinueWatchingSource {
  return source === "jellyfin" || source === "plex" || source === "trakt";
}

export function continueSourcePriority(source: ContinueWatchingSource): number {
  return source === "trakt" ? 1 : 0;
}

export function toMinuteKey(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return String(Math.floor(parsed.getTime() / 60000));
}

export function toDurationSeconds(
  minutes: number | null | undefined,
): number | null {
  if (!minutes || minutes <= 0) return null;
  return minutes * 60;
}

export function toProgressPercent(
  current: number,
  total: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  const percentage = Math.round((current / total) * 100);
  return Math.max(0, Math.min(100, percentage));
}

export function computeTrackingStatus(params: {
  mediaType: MediaType;
  history: Array<{ episodeId: string | null }>;
  releasedEpisodeIds: Set<string>;
  markDropped?: boolean;
}): TrackingStatus {
  if (params.markDropped) return "dropped";

  if (params.mediaType === "movie") {
    const hasMovieWatch = params.history.some(
      (event) => event.episodeId === null,
    );
    return hasMovieWatch ? "completed" : "none";
  }

  const watchedEpisodes = new Set(
    params.history
      .map((event) => event.episodeId)
      .filter(
        (episodeId): episodeId is string =>
          !!episodeId && params.releasedEpisodeIds.has(episodeId),
      ),
  );

  if (watchedEpisodes.size === 0) return "none";
  if (
    params.releasedEpisodeIds.size > 0 &&
    watchedEpisodes.size >= params.releasedEpisodeIds.size
  ) {
    return "completed";
  }
  return "watching";
}
