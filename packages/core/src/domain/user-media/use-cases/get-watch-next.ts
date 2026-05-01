import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import type { LibraryFeedRepositoryPort } from "@canto/core/domain/user-media/ports/library-feed-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type {
  CompletedPlaybackEpisodeRow,
  EpisodeByMediaRow,
  UserListMediaCandidateRow,
  UserMediaStateByMediaRow,
  UserWatchHistoryByMediaRow,
  WatchingShowMetadataRow,
} from "@canto/core/domain/user-media/types/library-feed";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";
import {
  hasConfirmedPastAirDate,
  toProgressPercent,
} from "@canto/core/domain/user-media/rules/user-media-rules";
import { buildBecauseWatched } from "@canto/core/domain/user-media/use-cases/build-because-watched";
import type {
  GetWatchNextInput,
  GetWatchNextResult,
  WatchNextItem,
} from "@canto/core/domain/user-media/types/watch-next";

export interface GetWatchNextDeps {
  userMedia: UserMediaRepositoryPort;
  recs: RecommendationsRepositoryPort;
  libraryFeed: LibraryFeedRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  userPrefs: UserPreferencesPort;
}

export type {
  GetWatchNextInput,
  GetWatchNextResult,
  WatchNextItem,
} from "@canto/core/domain/user-media/types/watch-next";

// JS-side ranking budget. We pull at most CANDIDATE_MULTIPLIER * limit list
// rows + watching shows, sort, and slice. If the user genuinely has more
// active candidates than this, the response truncates at the budget — better
// than a runaway query that times out the whole page.
const CANDIDATE_MULTIPLIER = 5;
const MIN_CANDIDATE_BUDGET = 60;

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

type ListMediaRow = UserListMediaCandidateRow;
type WatchingShowRow = WatchingShowMetadataRow;
type HistoryRow = UserWatchHistoryByMediaRow;
type CompletedPlaybackRow = CompletedPlaybackEpisodeRow;
type EpisodeRow = EpisodeByMediaRow;
type StateRow = UserMediaStateByMediaRow;

/**
 * Watch Next feed — combines two sources:
 *
 * 1. **Next-episode items** for shows the user is tracking (current behaviour).
 * 2. **"Because you watched X"** items: top recs derived from the user's
 *    most recent completions. Movie or show, depending on the filter.
 *
 * Items are merged, deduplicated by `mediaId` (next-episode wins when there
 * is overlap — it's a stronger signal), then sorted by `watchedAt` so the
 * most recent activity surfaces first.
 *
 * Pagination is offset-based because the final ranking is JS-side. We pull
 * at most CANDIDATE_MULTIPLIER * limit candidate rows from each source, so
 * the worst case is bounded regardless of how many lists / shows the user
 * has. If the user truly exceeds the budget, the response truncates rather
 * than timing the page out.
 */
export async function getWatchNext(
  db: Database,
  deps: GetWatchNextDeps,
  userId: string,
  input: GetWatchNextInput,
): Promise<GetWatchNextResult> {
  const limit = input.limit;
  const cursor = input.cursor ?? 0;

  const userLang = await getUserLanguage(deps, userId);

  // Next-episode items only make sense for shows. The because-watched
  // builder is run in parallel regardless of mediaType — for movies it
  // returns only movie-typed recs, for shows it can mix in finished-series
  // suggestions.
  const [nextEpisodeItems, becauseWatchedItems] = await Promise.all([
    input.mediaType === "movie"
      ? Promise.resolve<WatchNextItem[]>([])
      : buildShowNextEpisodeItems(deps, userId, userLang, input, cursor, limit),
    buildBecauseWatched(deps, userId, input.mediaType, userLang),
  ]);

  const nextEpisodeMediaIds = new Set(
    nextEpisodeItems.map((item) => item.mediaId),
  );
  const filteredBecauseWatched = becauseWatchedItems.filter(
    (item) => !nextEpisodeMediaIds.has(item.mediaId),
  );

  const allItems = [...nextEpisodeItems, ...filteredBecauseWatched];
  if (allItems.length === 0) return { items: [], nextCursor: null };

  allItems.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());

  const pageItems = allItems.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + limit < allItems.length ? cursor + limit : null;

  // Trailer keys batched for the page only — the because-watched builder
  // already attaches its own trailers, so only patch items missing one.
  const missingTrailerIds = pageItems
    .filter((item) => !item.trailerKey)
    .map((item) => item.mediaId);
  const trailerByMediaId =
    await deps.extras.findTrailerKeysForMediaIds(missingTrailerIds);
  const decoratedItems = pageItems.map((item) =>
    item.trailerKey
      ? item
      : { ...item, trailerKey: trailerByMediaId.get(item.mediaId) ?? null },
  );

  return { items: decoratedItems, nextCursor };
}

async function buildShowNextEpisodeItems(
  deps: GetWatchNextDeps,
  userId: string,
  userLang: string,
  input: GetWatchNextInput,
  cursor: number,
  limit: number,
): Promise<WatchNextItem[]> {
  const candidateBudget = Math.max(
    MIN_CANDIDATE_BUDGET,
    (cursor + limit) * CANDIDATE_MULTIPLIER,
  );
  const now = new Date();

  const [listMediaRows, watchingShows, continueMediaIds] = await Promise.all([
    deps.libraryFeed.findUserListMediaCandidates(
      userId,
      userLang,
      input.mediaType,
      candidateBudget,
    ),
    deps.libraryFeed.findUserWatchingShowsMetadata(
      userId,
      userLang,
      candidateBudget,
    ),
    deps.libraryFeed.findUserContinueWatchingMediaIds(userId, input.mediaType),
  ]);

  const rawListMediaMap = buildListCandidateMap(listMediaRows, watchingShows);

  // Drop anything already in Continue Watching (different endpoint owns it)
  // and anything that isn't a show (movies don't generate next_episode).
  const listMediaMap = new Map<string, ListCandidate>();
  for (const [mediaId, candidate] of rawListMediaMap) {
    if (continueMediaIds.has(mediaId)) continue;
    if (candidate.mediaType !== "show") continue;
    listMediaMap.set(mediaId, candidate);
  }

  if (listMediaMap.size === 0) return [];

  const candidateMediaIds = [...listMediaMap.keys()];
  const [states, historyRows, completedPlaybackRows, episodeRows] =
    await Promise.all([
      deps.libraryFeed.findUserMediaStatesByMediaIds(userId, candidateMediaIds),
      deps.libraryFeed.findUserWatchHistoryByMediaIds(userId, candidateMediaIds),
      deps.libraryFeed.findUserCompletedPlaybackByMediaIds(
        userId,
        candidateMediaIds,
      ),
      deps.libraryFeed.findEpisodesByMediaIds(candidateMediaIds, userLang),
    ]);

  const stateByMediaId = new Map(
    states.map((state) => [state.mediaId, state] as const),
  );
  const historyByMediaId = buildHistoryIndex(historyRows, completedPlaybackRows);
  const episodesByMediaId = buildEpisodesIndex(episodeRows);
  const lastActivityByMediaId = buildLastActivityIndex(historyRows);

  return buildNextEpisodeItems({
    listMediaMap,
    stateByMediaId,
    historyByMediaId,
    episodesByMediaId,
    lastActivityByMediaId,
    now,
  });
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
): Map<string, Date> {
  const index = new Map<string, Date>();
  for (const row of historyRows) {
    const current = index.get(row.mediaId);
    if (!current || row.watchedAt.getTime() > current.getTime()) {
      index.set(row.mediaId, row.watchedAt);
    }
  }
  return index;
}

interface BuildItemsParams {
  listMediaMap: Map<string, ListCandidate>;
  stateByMediaId: Map<string, StateRow>;
  historyByMediaId: Map<string, Array<{ episodeId: string | null }>>;
  episodesByMediaId: ReturnType<typeof buildEpisodesIndex>;
  lastActivityByMediaId: Map<string, Date>;
  now: Date;
}

function buildNextEpisodeItems(params: BuildItemsParams): WatchNextItem[] {
  const items: WatchNextItem[] = [];

  for (const candidate of params.listMediaMap.values()) {
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
      becauseOf: null,
    });
  }

  return items;
}
