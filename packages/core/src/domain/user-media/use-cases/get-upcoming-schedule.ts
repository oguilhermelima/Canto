import type { Database } from "@canto/db/client";
import {
  findEpisodesByMediaIds,
  findUserListMediaCandidates,
  findUserMediaStatesByMediaIds,
  findUserWatchHistoryByMediaIds,
} from "../../../infra/repositories";
import { getUserLanguage } from "../../shared/services/user-service";
import { parseDateLike } from "../rules/user-media-rules";

export interface GetUpcomingScheduleInput {
  limit: number;
  cursor?: number | null;
  mediaType?: "movie" | "show";
  q?: string;
}

type ListMediaRow = Awaited<
  ReturnType<typeof findUserListMediaCandidates>
>[number];
type EpisodeRow = Awaited<ReturnType<typeof findEpisodesByMediaIds>>[number];

interface ListCandidate {
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  releaseDate: string | null;
  externalId: number;
  provider: string;
  addedAt: Date;
  listNames: Set<string>;
}

export interface UpcomingItem {
  id: string;
  kind: "upcoming_episode" | "upcoming_movie";
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  fromLists: string[];
  releaseAt: Date;
  episode: {
    id: string;
    seasonNumber: number;
    number: number;
    title: string | null;
  } | null;
}

export async function getUpcomingSchedule(
  db: Database,
  userId: string,
  input: GetUpcomingScheduleInput,
) {
  const limit = input.limit;
  const cursor = input.cursor ?? 0;
  const now = new Date();
  const qNormalized = input.q?.trim().toLowerCase() ?? "";

  const userLang = await getUserLanguage(db, userId);
  const listMediaRows = await findUserListMediaCandidates(
    db,
    userId,
    userLang,
    input.mediaType,
  );
  const listMediaMap = buildListCandidateMap(listMediaRows, qNormalized);

  const candidateMediaIds = [...listMediaMap.keys()];
  const [states, historyRows, episodeRows] = await Promise.all([
    findUserMediaStatesByMediaIds(db, userId, candidateMediaIds),
    findUserWatchHistoryByMediaIds(db, userId, candidateMediaIds),
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
  const historyByMediaId = new Map<string, Array<{ episodeId: string | null }>>();
  for (const row of historyRows) {
    const bucket = historyByMediaId.get(row.mediaId) ?? [];
    bucket.push({ episodeId: row.episodeId });
    historyByMediaId.set(row.mediaId, bucket);
  }
  const episodesByMediaId = buildEpisodesIndex(episodeRows);

  const scheduleItems: UpcomingItem[] = [];
  for (const candidate of listMediaMap.values()) {
    const state = stateByMediaId.get(candidate.mediaId);
    if (state?.status === "completed" || state?.status === "dropped") continue;

    const mediaHistory = historyByMediaId.get(candidate.mediaId) ?? [];

    if (candidate.mediaType === "movie") {
      const movieItem = buildUpcomingMovieItem(candidate, mediaHistory, now);
      if (movieItem) scheduleItems.push(movieItem);
      continue;
    }

    const episodeItem = buildUpcomingEpisodeItem(
      candidate,
      mediaHistory,
      episodesByMediaId.get(candidate.mediaId) ?? [],
      now,
    );
    if (episodeItem) scheduleItems.push(episodeItem);
  }

  const sorted = scheduleItems.sort(
    (a, b) => a.releaseAt.getTime() - b.releaseAt.getTime(),
  );
  const sliced = sorted.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + limit < sorted.length ? cursor + limit : undefined;

  // Translation already applied at the source queries via mediaI18n / episodeI18n joins.
  return { items: sliced, total: sorted.length, nextCursor };
}

function buildListCandidateMap(
  rows: ListMediaRow[],
  qNormalized: string,
): Map<string, ListCandidate> {
  const map = new Map<string, ListCandidate>();
  for (const row of rows) {
    if (qNormalized && !row.title.toLowerCase().includes(qNormalized)) continue;

    const existing = map.get(row.mediaId);
    if (!existing) {
      map.set(row.mediaId, {
        mediaId: row.mediaId,
        mediaType: row.mediaType,
        title: row.title,
        posterPath: row.posterPath,
        backdropPath: row.backdropPath,
        logoPath: row.logoPath ?? null,
        year: row.year,
        releaseDate: row.releaseDate,
        externalId: row.externalId,
        provider: row.provider,
        addedAt: row.addedAt,
        listNames: new Set([row.listName]),
      });
      continue;
    }
    existing.listNames.add(row.listName);
    if (row.addedAt > existing.addedAt) existing.addedAt = row.addedAt;
  }
  return map;
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

function buildUpcomingMovieItem(
  candidate: ListCandidate,
  mediaHistory: Array<{ episodeId: string | null }>,
  now: Date,
): UpcomingItem | null {
  const hasMovieHistory = mediaHistory.some((entry) => entry.episodeId === null);
  if (hasMovieHistory) return null;

  const releaseAt = parseDateLike(candidate.releaseDate);
  if (!releaseAt || releaseAt.getTime() <= now.getTime()) return null;

  return {
    id: `upcoming-movie:${candidate.mediaId}`,
    kind: "upcoming_movie",
    mediaId: candidate.mediaId,
    mediaType: candidate.mediaType,
    title: candidate.title,
    posterPath: candidate.posterPath,
    backdropPath: candidate.backdropPath,
    logoPath: candidate.logoPath,
    year: candidate.year,
    externalId: candidate.externalId,
    provider: candidate.provider,
    fromLists: [...candidate.listNames],
    releaseAt,
    episode: null,
  };
}

function buildUpcomingEpisodeItem(
  candidate: ListCandidate,
  mediaHistory: Array<{ episodeId: string | null }>,
  episodes: Array<{
    episodeId: string;
    seasonNumber: number;
    episodeNumber: number;
    episodeTitle: string | null;
    airDate: string | null;
  }>,
  now: Date,
): UpcomingItem | null {
  const watchedEpisodeIds = new Set(
    mediaHistory
      .map((entry) => entry.episodeId)
      .filter((episodeId): episodeId is string => !!episodeId),
  );

  const upcomingEpisodes = episodes
    .map((episode) => ({ ...episode, airDate: parseDateLike(episode.airDate) }))
    .filter(
      (
        episode,
      ): episode is {
        episodeId: string;
        seasonNumber: number;
        episodeNumber: number;
        episodeTitle: string | null;
        airDate: Date;
      } => !!episode.airDate && episode.airDate.getTime() > now.getTime(),
    )
    .sort((a, b) => a.airDate.getTime() - b.airDate.getTime());

  if (upcomingEpisodes.length === 0) return null;

  const nextUpcomingEpisode =
    upcomingEpisodes.find(
      (episode) => !watchedEpisodeIds.has(episode.episodeId),
    ) ?? upcomingEpisodes[0];
  if (!nextUpcomingEpisode) return null;

  return {
    id: `upcoming-episode:${candidate.mediaId}:${nextUpcomingEpisode.episodeId}`,
    kind: "upcoming_episode",
    mediaId: candidate.mediaId,
    mediaType: candidate.mediaType,
    title: candidate.title,
    posterPath: candidate.posterPath,
    backdropPath: candidate.backdropPath,
    logoPath: candidate.logoPath,
    year: candidate.year,
    externalId: candidate.externalId,
    provider: candidate.provider,
    fromLists: [...candidate.listNames],
    releaseAt: nextUpcomingEpisode.airDate,
    episode: {
      id: nextUpcomingEpisode.episodeId,
      seasonNumber: nextUpcomingEpisode.seasonNumber,
      number: nextUpcomingEpisode.episodeNumber,
      title: nextUpcomingEpisode.episodeTitle,
    },
  };
}
