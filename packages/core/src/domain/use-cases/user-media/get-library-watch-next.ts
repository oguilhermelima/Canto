import type { Database } from "@canto/db/client";
import {
  findEpisodesByMediaIds,
  findUserCompletedPlaybackByMediaIds,
  findUserListMediaCandidates,
  findUserMediaStatesByMediaIds,
  findUserPlaybackProgressFeed,
  findUserWatchHistoryByMediaIds,
  findUserWatchingShowsMetadata,
  type LibraryFeedFilterOptions,
} from "../../../infrastructure/repositories";
import { getUserLanguage } from "../../shared/services/user-service";
import {
  continueSourcePriority,
  hasConfirmedPastAirDate,
  isContinueWatchingSource,
  toDurationSeconds,
  toProgressPercent,
} from "../../user-media/rules/user-media-rules";

type Kind = "continue" | "next_episode" | "next_movie";
type Source = "jellyfin" | "plex" | "trakt" | "list";
type ProgressUnit = "seconds" | "episodes" | null;
type WatchStatus = "in_progress" | "completed" | "not_started";
type View = "all" | "continue" | "watch_next";

export interface GetLibraryWatchNextInput {
  limit: number;
  cursor?: number | null;
  view: View;
  mediaType?: "movie" | "show";
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
}

export interface MergedItem {
  id: string;
  kind: Kind;
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  trailerKey: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  source: Source;
  progressSeconds: number;
  durationSeconds: number | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: ProgressUnit;
  watchedAt: Date | null;
  episode: {
    id: string;
    seasonNumber: number | null;
    number: number | null;
    title: string | null;
  } | null;
  fromLists: string[];
}

interface ContinueItem extends MergedItem {
  kind: "continue";
  source: "jellyfin" | "plex" | "trakt";
  sortDate: Date;
  watchedAt: Date;
}

interface NextListItem extends MergedItem {
  kind: "next_episode" | "next_movie";
  source: "list";
  sortDate: Date;
}

interface ListCandidate {
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  addedAt: Date;
  listNames: Set<string>;
  listTypes: Set<string>;
  isFromWatchlist: boolean;
}

export async function getLibraryWatchNext(
  db: Database,
  userId: string,
  input: GetLibraryWatchNextInput,
) {
  const limit = input.limit;
  const cursor = input.cursor ?? 0;
  const now = new Date();

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
  };

  const userLang = await getUserLanguage(db, userId);

  const [playbackRows, listMediaRows, watchingShows] = await Promise.all([
    findUserPlaybackProgressFeed(db, userId, userLang, input.mediaType, filters),
    findUserListMediaCandidates(db, userId, userLang, input.mediaType),
    input.mediaType === "movie"
      ? Promise.resolve([])
      : findUserWatchingShowsMetadata(db, userId, userLang),
  ]);

  const continueMediaIds = new Set<string>();
  const continueItems = buildContinueItems(playbackRows, continueMediaIds);
  const listMediaMap = buildListCandidateMap(listMediaRows, watchingShows);

  const candidateMediaIds = [...listMediaMap.keys()];
  const [states, historyRows, completedPlaybackRows, episodeRows] =
    await Promise.all([
      findUserMediaStatesByMediaIds(db, userId, candidateMediaIds),
      findUserWatchHistoryByMediaIds(db, userId, candidateMediaIds),
      findUserCompletedPlaybackByMediaIds(db, userId, candidateMediaIds),
      findEpisodesByMediaIds(
        db,
        candidateMediaIds.filter(
          (mediaId) => listMediaMap.get(mediaId)?.mediaType === "show",
        ),
        userLang,
      ),
    ]);

  const stateByMediaId = new Map(
    states.map((state) => [state.mediaId, state] as const),
  );
  const historyByMediaId = buildHistoryIndex(historyRows, completedPlaybackRows);
  const episodesByMediaId = buildEpisodesIndex(episodeRows);
  const lastActivityByMediaId = buildLastActivityIndex(
    historyRows,
    playbackRows,
  );

  const listItems = buildNextListItems({
    listMediaMap,
    continueMediaIds,
    stateByMediaId,
    historyByMediaId,
    episodesByMediaId,
    lastActivityByMediaId,
    now,
  });

  const merged = [
    ...sortByActivityDesc(continueItems),
    ...sortByActivityDesc(listItems),
  ].map(stripSortDate);

  let filtered = filterByView(merged, input.view);
  if (input.watchStatus) {
    filtered = filterByWatchStatus(filtered, input.watchStatus);
  }

  const sliced = filtered.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + limit < filtered.length ? cursor + limit : undefined;

  // Translation already applied at the source queries via mediaI18n / episodeI18n joins.
  return { items: sliced, total: filtered.length, nextCursor };
}

type PlaybackRow = Awaited<
  ReturnType<typeof findUserPlaybackProgressFeed>
>[number];
type ListMediaRow = Awaited<
  ReturnType<typeof findUserListMediaCandidates>
>[number];
type WatchingShowRow = Awaited<
  ReturnType<typeof findUserWatchingShowsMetadata>
>[number];
type HistoryRow = Awaited<
  ReturnType<typeof findUserWatchHistoryByMediaIds>
>[number];
type CompletedPlaybackRow = Awaited<
  ReturnType<typeof findUserCompletedPlaybackByMediaIds>
>[number];
type EpisodeRow = Awaited<ReturnType<typeof findEpisodesByMediaIds>>[number];
type StateRow = Awaited<
  ReturnType<typeof findUserMediaStatesByMediaIds>
>[number];

function buildContinueItems(
  playbackRows: PlaybackRow[],
  continueMediaIds: Set<string>,
): ContinueItem[] {
  const items: ContinueItem[] = [];
  const sorted = playbackRows
    .filter((row) => {
      if (!isContinueWatchingSource(row.source)) return false;
      if (row.isCompleted) return false;
      if (row.positionSeconds <= 0) return false;
      if (!row.lastWatchedAt) return false;
      return true;
    })
    .sort((a, b) => {
      const priorityDiff =
        continueSourcePriority(a.source as "jellyfin" | "plex" | "trakt") -
        continueSourcePriority(b.source as "jellyfin" | "plex" | "trakt");
      if (priorityDiff !== 0) return priorityDiff;
      return (
        (b.lastWatchedAt?.getTime() ?? 0) - (a.lastWatchedAt?.getTime() ?? 0)
      );
    });

  for (const row of sorted) {
    if (!isContinueWatchingSource(row.source)) continue;
    if (continueMediaIds.has(row.mediaId)) continue;
    if (!row.lastWatchedAt) continue;

    const durationSeconds = toDurationSeconds(
      row.episodeRuntime ?? row.mediaRuntime,
    );

    continueMediaIds.add(row.mediaId);
    items.push({
      id: `continue:${row.id}`,
      kind: "continue",
      mediaId: row.mediaId,
      mediaType: row.mediaType,
      title: row.title,
      posterPath: row.posterPath,
      backdropPath: row.backdropPath,
      logoPath: row.logoPath,
      overview: row.overview,
      voteAverage: row.voteAverage,
      genres: row.genres,
      genreIds: row.genreIds,
      trailerKey: row.trailerKey,
      year: row.year,
      externalId: row.externalId,
      provider: row.provider,
      source: row.source,
      progressSeconds: row.positionSeconds,
      durationSeconds,
      progressPercent:
        durationSeconds !== null
          ? toProgressPercent(row.positionSeconds, durationSeconds)
          : null,
      progressValue: row.positionSeconds,
      progressTotal: durationSeconds,
      progressUnit: "seconds",
      watchedAt: row.lastWatchedAt,
      episode: row.episodeId
        ? {
            id: row.episodeId,
            seasonNumber: row.seasonNumber,
            number: row.episodeNumber,
            title: row.episodeTitle,
          }
        : null,
      fromLists: [],
      sortDate: row.lastWatchedAt,
    });
  }

  return items;
}

function buildListCandidateMap(
  listMediaRows: ListMediaRow[],
  watchingShows: WatchingShowRow[],
): Map<string, ListCandidate> {
  const listMediaMap = new Map<string, ListCandidate>();

  for (const row of listMediaRows) {
    const existing = listMediaMap.get(row.mediaId);
    if (!existing) {
      const isWatchlist = row.listType === "watchlist";
      listMediaMap.set(row.mediaId, {
        mediaId: row.mediaId,
        mediaType: row.mediaType,
        title: row.title,
        posterPath: row.posterPath,
        backdropPath: row.backdropPath,
        logoPath: row.logoPath ?? null,
        year: row.year,
        externalId: row.externalId,
        provider: row.provider,
        addedAt: row.addedAt,
        listNames: new Set([row.listName]),
        listTypes: new Set([row.listType]),
        isFromWatchlist: isWatchlist,
      });
      continue;
    }
    existing.listNames.add(row.listName);
    existing.listTypes.add(row.listType);
    if (row.listType === "watchlist") existing.isFromWatchlist = true;
    if (row.addedAt > existing.addedAt) existing.addedAt = row.addedAt;
  }

  for (const row of watchingShows) {
    if (listMediaMap.has(row.mediaId)) continue;
    listMediaMap.set(row.mediaId, {
      mediaId: row.mediaId,
      mediaType: row.mediaType,
      title: row.title,
      posterPath: row.posterPath,
      backdropPath: row.backdropPath,
      logoPath: row.logoPath ?? null,
      year: row.year,
      externalId: row.externalId,
      provider: row.provider,
      addedAt: row.lastActivityAt ?? new Date(),
      listNames: new Set(),
      listTypes: new Set(),
      isFromWatchlist: false,
    });
  }

  return listMediaMap;
}

function buildHistoryIndex(
  historyRows: HistoryRow[],
  completedPlaybackRows: CompletedPlaybackRow[],
): Map<string, Array<{ episodeId: string | null }>> {
  const index = new Map<string, Array<{ episodeId: string | null }>>();
  for (const row of historyRows) {
    const bucket = index.get(row.mediaId) ?? [];
    bucket.push({ episodeId: row.episodeId });
    index.set(row.mediaId, bucket);
  }
  for (const row of completedPlaybackRows) {
    const bucket = index.get(row.mediaId) ?? [];
    bucket.push({ episodeId: row.episodeId });
    index.set(row.mediaId, bucket);
  }
  return index;
}

function buildEpisodesIndex(
  episodeRows: EpisodeRow[],
): Map<
  string,
  Array<{
    episodeId: string;
    seasonNumber: number;
    episodeNumber: number;
    episodeTitle: string | null;
    airDate: string | null;
  }>
> {
  const index = new Map<
    string,
    Array<{
      episodeId: string;
      seasonNumber: number;
      episodeNumber: number;
      episodeTitle: string | null;
      airDate: string | null;
    }>
  >();
  for (const row of episodeRows) {
    const bucket = index.get(row.mediaId) ?? [];
    bucket.push({
      episodeId: row.episodeId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      episodeTitle: row.episodeTitle,
      airDate: row.airDate,
    });
    index.set(row.mediaId, bucket);
  }
  return index;
}

function buildLastActivityIndex(
  historyRows: HistoryRow[],
  playbackRows: PlaybackRow[],
): Map<string, Date> {
  const index = new Map<string, Date>();
  const update = (mediaId: string, when: Date | null) => {
    if (!when) return;
    const current = index.get(mediaId);
    if (!current || when.getTime() > current.getTime()) {
      index.set(mediaId, when);
    }
  };
  for (const row of historyRows) update(row.mediaId, row.watchedAt);
  for (const row of playbackRows) update(row.mediaId, row.lastWatchedAt);
  return index;
}

function buildNextListItems(params: {
  listMediaMap: Map<string, ListCandidate>;
  continueMediaIds: Set<string>;
  stateByMediaId: Map<string, StateRow>;
  historyByMediaId: Map<string, Array<{ episodeId: string | null }>>;
  episodesByMediaId: ReturnType<typeof buildEpisodesIndex>;
  lastActivityByMediaId: Map<string, Date>;
  now: Date;
}): NextListItem[] {
  const items: NextListItem[] = [];

  for (const candidate of params.listMediaMap.values()) {
    if (params.continueMediaIds.has(candidate.mediaId)) continue;
    if (candidate.mediaType !== "show") continue;

    const state = params.stateByMediaId.get(candidate.mediaId);
    if (state?.status === "completed" || state?.status === "dropped") continue;

    const mediaHistory =
      params.historyByMediaId.get(candidate.mediaId) ?? [];
    const fromLists = [...candidate.listNames];

    const releasedEpisodes = (
      params.episodesByMediaId.get(candidate.mediaId) ?? []
    ).filter(
      (episode) =>
        episode.seasonNumber > 0 &&
        hasConfirmedPastAirDate(episode.airDate, params.now),
    );
    if (releasedEpisodes.length === 0) continue;

    const releasedEpisodeIds = new Set(
      releasedEpisodes.map((e) => e.episodeId),
    );
    const watchedEpisodeIds = new Set(
      mediaHistory
        .map((entry) => entry.episodeId)
        .filter((episodeId): episodeId is string => !!episodeId),
    );
    const watchedEpisodesCount = [...watchedEpisodeIds].filter((id) =>
      releasedEpisodeIds.has(id),
    ).length;
    if (watchedEpisodesCount === 0) continue;

    const availableEpisodesCount = releasedEpisodes.length;
    const nextEpisode = releasedEpisodes.find(
      (episode) => !watchedEpisodeIds.has(episode.episodeId),
    );
    if (!nextEpisode) continue;

    const lastActivity =
      params.lastActivityByMediaId.get(candidate.mediaId) ?? candidate.addedAt;

    items.push({
      id: `next-episode:${candidate.mediaId}:${nextEpisode.episodeId}`,
      kind: "next_episode",
      mediaId: candidate.mediaId,
      mediaType: candidate.mediaType,
      title: candidate.title,
      posterPath: candidate.posterPath,
      backdropPath: candidate.backdropPath,
      logoPath: candidate.logoPath,
      overview: null,
      voteAverage: null,
      genres: null,
      genreIds: null,
      trailerKey: null,
      year: candidate.year,
      externalId: candidate.externalId,
      provider: candidate.provider,
      source: "list",
      progressSeconds: 0,
      durationSeconds: null,
      progressPercent: toProgressPercent(
        watchedEpisodesCount,
        availableEpisodesCount,
      ),
      progressValue: watchedEpisodesCount,
      progressTotal: availableEpisodesCount,
      progressUnit: "episodes",
      watchedAt: lastActivity,
      episode: {
        id: nextEpisode.episodeId,
        seasonNumber: nextEpisode.seasonNumber,
        number: nextEpisode.episodeNumber,
        title: nextEpisode.episodeTitle,
      },
      fromLists,
      sortDate: lastActivity,
    });
  }

  return items;
}

function sortByActivityDesc<T extends { sortDate: Date }>(items: T[]): T[] {
  return items.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}

function stripSortDate<T extends { sortDate: Date }>(
  item: T,
): Omit<T, "sortDate"> {
  const { sortDate: _sortDate, ...rest } = item;
  return rest;
}

function filterByView(items: MergedItem[], view: View): MergedItem[] {
  if (view === "continue") return items.filter((item) => item.kind === "continue");
  if (view === "watch_next")
    return items.filter((item) => item.kind !== "continue");
  return items;
}

function filterByWatchStatus(
  items: MergedItem[],
  watchStatus: WatchStatus,
): MergedItem[] {
  return items.filter((item) => {
    switch (watchStatus) {
      case "in_progress":
        return (
          item.kind === "continue" ||
          (item.progressPercent !== null &&
            item.progressPercent > 0 &&
            item.progressPercent < 100)
        );
      case "completed":
        return item.progressPercent === 100;
      case "not_started":
        return (
          item.kind !== "continue" &&
          (item.progressPercent === null || item.progressPercent === 0)
        );
      default:
        return true;
    }
  });
}
