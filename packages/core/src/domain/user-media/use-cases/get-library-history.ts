import type { Database } from "@canto/db/client";
import {
  findEpisodesByMediaIds,
  findUserWatchHistoryByMediaIds,
} from "@canto/core/infra/user-media/watch-history-repository";
import {
  findUserPlaybackProgressFeed,
  findUserWatchHistoryFeed
  
} from "@canto/core/infra/user-media/library-feed-repository";
import type { LibraryFeedFilterOptions } from "@canto/core/domain/user-media/types/library-feed";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";
import {
  isReleasedOnOrBefore,
  isServerSource,
  toDurationSeconds,
  toMinuteKey,
  toProgressPercent,
} from "@canto/core/domain/user-media/rules/user-media-rules";

type WatchStatus = "in_progress" | "completed" | "not_started";

export interface GetLibraryHistoryInput {
  limit: number;
  cursor?: number | null;
  mediaType?: "movie" | "show";
  completedOnly?: boolean;
  watchStatus?: WatchStatus;
  q?: string;
  source?: LibraryFeedFilterOptions["source"];
  yearMin?: number;
  yearMax?: number;
  genreIds?: number[];
  sortBy?: LibraryFeedFilterOptions["sortBy"];
  scoreMin?: number;
  scoreMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  language?: string;
  certification?: string;
  tvStatus?: string;
  watchedFrom?: string;
  watchedTo?: string;
}

interface TimelineEntry {
  id: string;
  entryType: "history" | "playback";
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  voteAverage: number | null;
  userRating: number | null;
  externalId: number;
  provider: string;
  watchedAt: Date;
  source: string | null;
  episode: {
    id: string | null;
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;
  isCompleted: boolean | null;
  progressSeconds: number | null;
  durationSeconds: number | null;
}

type HistoryFeedRow = Awaited<ReturnType<typeof findUserWatchHistoryFeed>>[number];
type PlaybackFeedRow = Awaited<
  ReturnType<typeof findUserPlaybackProgressFeed>
>[number];

export async function getLibraryHistory(
  db: Database,
  userId: string,
  input: GetLibraryHistoryInput,
) {
  const limit = input.limit;
  const cursor = input.cursor ?? 0;
  const fetchLimit = Math.max(300, (cursor + limit) * 3);

  const filters: LibraryFeedFilterOptions = {
    q: input.q,
    source: input.source,
    yearMin: input.yearMin,
    yearMax: input.yearMax,
    genreIds: input.genreIds,
    sortBy: input.sortBy,
    scoreMin: input.scoreMin,
    scoreMax: input.scoreMax,
    runtimeMin: input.runtimeMin,
    runtimeMax: input.runtimeMax,
    language: input.language,
    certification: input.certification,
    tvStatus: input.tvStatus,
    watchedFrom: input.watchedFrom,
    watchedTo: input.watchedTo,
  };

  const userLang = await getUserLanguage(db, userId);
  const [historyRows, playbackRows] = await Promise.all([
    findUserWatchHistoryFeed(db, userId, userLang, fetchLimit, input.mediaType, filters),
    findUserPlaybackProgressFeed(db, userId, userLang, input.mediaType, filters),
  ]);

  const timelineEntries: TimelineEntry[] = [];
  for (const row of historyRows) {
    const entry = buildHistoryEntry(row);
    if (entry) timelineEntries.push(entry);
  }
  for (const row of playbackRows) {
    const entry = buildPlaybackEntry(row);
    if (entry) timelineEntries.push(entry);
  }

  sortTimeline(timelineEntries, input.sortBy);
  const deduped = dedupeAndFilter(timelineEntries, input);

  const pageItems = deduped.slice(cursor, cursor + limit);
  const [watchedEpisodesByMediaId, availableEpisodesByMediaId] =
    await loadShowProgressMaps(db, userId, userLang, pageItems);

  const items = pageItems.map((entry) =>
    decorateEntry(entry, watchedEpisodesByMediaId, availableEpisodesByMediaId),
  );
  const nextCursor =
    cursor + limit < deduped.length ? cursor + limit : undefined;

  return { items, total: deduped.length, nextCursor };
}

function buildHistoryEntry(row: HistoryFeedRow): TimelineEntry | null {
  const serverFallbackEpisode =
    row.mediaType === "show" && !row.episodeId && isServerSource(row.source)
      ? {
          id: `server-unknown:${row.id}`,
          seasonNumber: null,
          number: null,
          title: "Server episode",
        }
      : null;

  if (row.mediaType === "show" && !row.episodeId && !serverFallbackEpisode) {
    return null;
  }

  return {
    id: row.id,
    entryType: "history",
    mediaId: row.mediaId,
    mediaType: row.mediaType,
    title: row.title,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
    logoPath: row.logoPath,
    year: row.year,
    voteAverage: row.voteAverage,
    userRating: row.userRating,
    externalId: row.externalId,
    provider: row.provider,
    watchedAt: row.watchedAt,
    source: row.source ?? null,
    episode: row.episodeId
      ? {
          id: row.episodeId,
          seasonNumber: row.seasonNumber,
          number: row.episodeNumber,
          title: row.episodeTitle,
        }
      : serverFallbackEpisode,
    isCompleted: true,
    progressSeconds: null,
    durationSeconds: null,
  };
}

function buildPlaybackEntry(row: PlaybackFeedRow): TimelineEntry | null {
  if (!row.lastWatchedAt) return null;
  if (!row.isCompleted && row.positionSeconds <= 0) return null;
  if (!isServerSource(row.source)) return null;

  const serverFallbackEpisode =
    row.mediaType === "show" && !row.episodeId
      ? {
          id: `server-unknown:playback:${row.id}`,
          seasonNumber: null,
          number: null,
          title: "Server episode",
        }
      : null;

  return {
    id: `playback:${row.id}`,
    entryType: "playback",
    mediaId: row.mediaId,
    mediaType: row.mediaType,
    title: row.title,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
    logoPath: row.logoPath,
    year: row.year,
    voteAverage: row.voteAverage,
    userRating: row.userRating,
    externalId: row.externalId,
    provider: row.provider,
    watchedAt: row.lastWatchedAt,
    source: row.source,
    episode: row.episodeId
      ? {
          id: row.episodeId,
          seasonNumber: row.seasonNumber,
          number: row.episodeNumber,
          title: row.episodeTitle,
        }
      : serverFallbackEpisode,
    isCompleted: row.isCompleted,
    progressSeconds: row.positionSeconds,
    durationSeconds: toDurationSeconds(row.episodeRuntime ?? row.mediaRuntime),
  };
}

function sortTimeline(
  entries: TimelineEntry[],
  sortBy: GetLibraryHistoryInput["sortBy"],
): void {
  entries.sort((a, b) => {
    switch (sortBy) {
      case "name_asc":
        return a.title.localeCompare(b.title);
      case "name_desc":
        return b.title.localeCompare(a.title);
      case "year_asc":
        return (a.year ?? 0) - (b.year ?? 0);
      case "year_desc":
        return (b.year ?? 0) - (a.year ?? 0);
      case "recently_watched":
      default:
        return b.watchedAt.getTime() - a.watchedAt.getTime();
    }
  });
}

function dedupeAndFilter(
  entries: TimelineEntry[],
  input: GetLibraryHistoryInput,
): TimelineEntry[] {
  const deduped: TimelineEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.mediaId}:${entry.episode?.id ?? "movie"}:${toMinuteKey(
      entry.watchedAt,
    )}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (input.completedOnly && !entry.isCompleted) continue;
    if (input.watchStatus) {
      const completed = entry.isCompleted === true;
      const hasProgress = (entry.progressSeconds ?? 0) > 0;
      switch (input.watchStatus) {
        case "in_progress":
          if (completed || !hasProgress) continue;
          break;
        case "completed":
          if (!completed) continue;
          break;
        case "not_started":
          if (completed || hasProgress) continue;
          break;
      }
    }
    deduped.push(entry);
  }
  return deduped;
}

async function loadShowProgressMaps(
  db: Database,
  userId: string,
  language: string,
  pageItems: TimelineEntry[],
): Promise<[Map<string, Set<string>>, Map<string, number>]> {
  const showMediaIds = [
    ...new Set(
      pageItems
        .filter((item) => item.mediaType === "show")
        .map((item) => item.mediaId),
    ),
  ];
  const [showHistoryRows, showEpisodeRows] =
    showMediaIds.length > 0
      ? await Promise.all([
          findUserWatchHistoryByMediaIds(db, userId, showMediaIds),
          findEpisodesByMediaIds(db, showMediaIds, language),
        ])
      : [[], []];

  const watchedEpisodesByMediaId = new Map<string, Set<string>>();
  for (const row of showHistoryRows) {
    if (!row.episodeId) continue;
    const watchedSet =
      watchedEpisodesByMediaId.get(row.mediaId) ?? new Set<string>();
    watchedSet.add(row.episodeId);
    watchedEpisodesByMediaId.set(row.mediaId, watchedSet);
  }

  const now = new Date();
  const availableEpisodesByMediaId = new Map<string, number>();
  for (const row of showEpisodeRows) {
    if (!isReleasedOnOrBefore(row.airDate, now)) continue;
    availableEpisodesByMediaId.set(
      row.mediaId,
      (availableEpisodesByMediaId.get(row.mediaId) ?? 0) + 1,
    );
  }

  return [watchedEpisodesByMediaId, availableEpisodesByMediaId];
}

function decorateEntry(
  entry: TimelineEntry,
  watchedEpisodesByMediaId: Map<string, Set<string>>,
  availableEpisodesByMediaId: Map<string, number>,
) {
  if (entry.entryType === "playback") {
    const progressSeconds = entry.progressSeconds ?? 0;
    const durationSeconds = entry.durationSeconds;

    if (entry.isCompleted) {
      return {
        ...entry,
        progressPercent: 100,
        progressValue: durationSeconds ?? 1,
        progressTotal: durationSeconds ?? 1,
        progressUnit: durationSeconds ? ("seconds" as const) : null,
      };
    }

    if (durationSeconds !== null && progressSeconds > 0) {
      return {
        ...entry,
        progressPercent: toProgressPercent(progressSeconds, durationSeconds),
        progressValue: progressSeconds,
        progressTotal: durationSeconds,
        progressUnit: "seconds" as const,
      };
    }

    return {
      ...entry,
      progressPercent: null,
      progressValue: null,
      progressTotal: null,
      progressUnit: null,
    };
  }

  if (entry.mediaType === "movie") {
    return {
      ...entry,
      progressPercent: 100,
      progressValue: 1,
      progressTotal: 1,
      progressUnit: null,
    };
  }

  const watchedEpisodes =
    watchedEpisodesByMediaId.get(entry.mediaId)?.size ?? 0;
  const hasUnknownServerEpisode =
    typeof entry.episode?.id === "string" &&
    entry.episode.id.startsWith("server-unknown:");
  const normalizedWatchedEpisodes = hasUnknownServerEpisode
    ? Math.max(watchedEpisodes, 1)
    : watchedEpisodes;
  const availableEpisodes = Math.max(
    normalizedWatchedEpisodes,
    availableEpisodesByMediaId.get(entry.mediaId) ?? 0,
  );

  return {
    ...entry,
    progressPercent: toProgressPercent(
      normalizedWatchedEpisodes,
      availableEpisodes,
    ),
    progressValue: normalizedWatchedEpisodes,
    progressTotal: availableEpisodes > 0 ? availableEpisodes : null,
    progressUnit: "episodes" as const,
  };
}
