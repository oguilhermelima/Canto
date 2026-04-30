import type { Database } from "@canto/db/client";
import {
  findEpisodesByMediaIds,
  findUserListMediaCandidates,
  findUserMediaStatesByMediaIds,
  findUserWatchHistoryByMediaIds,
} from "@canto/core/infra/repositories";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";
import { parseDateLike } from "@canto/core/domain/user-media/rules/user-media-rules";

export interface GetUpcomingScheduleInput {
  limit: number;
  cursor?: number | null;
  mediaType?: "movie" | "show";
  q?: string;
  mode?: "next" | "all";
  from?: Date;
  to?: Date;
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
  airsTime: string | null;
  originCountry: string[] | null;
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
  /** True when releaseAt was synthesized from a real airsTime + TZ; false when
   *  it's just midnight UTC and the consumer should hide the time portion. */
  hasAirTime: boolean;
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

    const episodeItems = buildUpcomingEpisodeItems(
      candidate,
      mediaHistory,
      episodesByMediaId.get(candidate.mediaId) ?? [],
      now,
      input.mode ?? "next",
    );
    for (const item of episodeItems) scheduleItems.push(item);
  }

  const sorted = scheduleItems.sort(
    (a, b) => a.releaseAt.getTime() - b.releaseAt.getTime(),
  );
  const fromMs = input.from?.getTime();
  const toMs = input.to?.getTime();
  const windowed =
    fromMs === undefined && toMs === undefined
      ? sorted
      : sorted.filter((item) => {
          const t = item.releaseAt.getTime();
          if (fromMs !== undefined && t < fromMs) return false;
          if (toMs !== undefined && t >= toMs) return false;
          return true;
        });
  const sliced = windowed.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + limit < windowed.length ? cursor + limit : undefined;

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
        airsTime: row.airsTime,
        originCountry: row.originCountry,
      });
      continue;
    }
    existing.listNames.add(row.listName);
    if (row.addedAt > existing.addedAt) existing.addedAt = row.addedAt;
  }
  return map;
}

/**
 * Map ISO 3166-1 alpha-2 country codes to representative IANA timezones for
 * prime-time TV. Used as a best-effort fallback when episodes ship only a
 * date and the show's network airs in a specific country. We keep the map
 * narrow on purpose — anything outside it just falls back to "no time".
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  US: "America/New_York", GB: "Europe/London", JP: "Asia/Tokyo",
  KR: "Asia/Seoul", CN: "Asia/Shanghai", TW: "Asia/Taipei",
  CA: "America/Toronto", AU: "Australia/Sydney", NZ: "Pacific/Auckland",
  BR: "America/Sao_Paulo", MX: "America/Mexico_City",
  AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago",
  CO: "America/Bogota", DE: "Europe/Berlin", FR: "Europe/Paris",
  ES: "Europe/Madrid", IT: "Europe/Rome", NL: "Europe/Amsterdam",
  SE: "Europe/Stockholm", NO: "Europe/Oslo", DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki", PL: "Europe/Warsaw", TR: "Europe/Istanbul",
  RU: "Europe/Moscow", IN: "Asia/Kolkata", IE: "Europe/Dublin",
  BE: "Europe/Brussels", PT: "Europe/Lisbon", AT: "Europe/Vienna",
  CH: "Europe/Zurich", IL: "Asia/Jerusalem", TH: "Asia/Bangkok",
  ID: "Asia/Jakarta", PH: "Asia/Manila", MY: "Asia/Kuala_Lumpur",
};

function pickIanaTz(originCountry: string[] | null | undefined): string | null {
  if (!originCountry || originCountry.length === 0) return null;
  for (const code of originCountry) {
    const tz = COUNTRY_TIMEZONES[code.toUpperCase()];
    if (tz) return tz;
  }
  return null;
}

/**
 * Combine a date string ("2026-04-30"), a time-of-day ("21:00"), and an IANA
 * timezone into a UTC-anchored Date. We can't construct a Date directly in a
 * non-local TZ, so we build the wall-clock as if it were UTC, ask
 * Intl.DateTimeFormat what that instant looks like in the target TZ, and
 * subtract the resulting offset. Handles DST automatically.
 */
function buildAirDateTimeUtc(
  dateStr: string,
  airsTime: string,
  tz: string,
): Date | null {
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = airsTime.match(/^(\d{1,2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;

  const [, yyyy, mo, dd] = dateMatch;
  const [, hh, mm] = timeMatch;
  const wallAsUtc = Date.UTC(+yyyy!, +mo! - 1, +dd!, +hh!, +mm!);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(wallAsUtc)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const tzWallAsUtc = Date.UTC(
    +parts.year!, +parts.month! - 1, +parts.day!,
    +parts.hour! % 24, +parts.minute!,
  );
  const offsetMs = tzWallAsUtc - wallAsUtc;
  return new Date(wallAsUtc - offsetMs);
}

function resolveReleaseAt(
  airDate: Date,
  airsTime: string | null,
  originCountry: string[] | null,
): { releaseAt: Date; hasAirTime: boolean } {
  if (!airsTime) return { releaseAt: airDate, hasAirTime: false };
  const tz = pickIanaTz(originCountry);
  if (!tz) return { releaseAt: airDate, hasAirTime: false };

  // airDate at this point is parseDateLike of "YYYY-MM-DD" — i.e. UTC midnight.
  // Re-derive the wall date string in UTC so DST/offset of the user machine
  // doesn't drift the calendar day.
  const dateStr = airDate.toISOString().slice(0, 10);
  const combined = buildAirDateTimeUtc(dateStr, airsTime, tz);
  if (!combined) return { releaseAt: airDate, hasAirTime: false };
  return { releaseAt: combined, hasAirTime: true };
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

  const baseDate = parseDateLike(candidate.releaseDate);
  if (!baseDate || baseDate.getTime() <= now.getTime()) return null;

  // Movies don't have a daily airing slot — we only know the release date.
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
    releaseAt: baseDate,
    hasAirTime: false,
    episode: null,
  };
}

function buildUpcomingEpisodeItems(
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
  mode: "next" | "all",
): UpcomingItem[] {
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

  if (upcomingEpisodes.length === 0) return [];

  const unwatched = upcomingEpisodes.filter(
    (episode) => !watchedEpisodeIds.has(episode.episodeId),
  );

  if (mode === "all") {
    const source = unwatched.length > 0 ? unwatched : upcomingEpisodes;
    return source.map((ep) => toUpcomingItem(candidate, ep));
  }

  const nextUpcomingEpisode = unwatched[0] ?? upcomingEpisodes[0];
  if (!nextUpcomingEpisode) return [];
  return [toUpcomingItem(candidate, nextUpcomingEpisode)];
}

function toUpcomingItem(
  candidate: ListCandidate,
  episode: {
    episodeId: string;
    seasonNumber: number;
    episodeNumber: number;
    episodeTitle: string | null;
    airDate: Date;
  },
): UpcomingItem {
  const { releaseAt, hasAirTime } = resolveReleaseAt(
    episode.airDate,
    candidate.airsTime,
    candidate.originCountry,
  );

  return {
    id: `upcoming-episode:${candidate.mediaId}:${episode.episodeId}`,
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
    releaseAt,
    hasAirTime,
    episode: {
      id: episode.episodeId,
      seasonNumber: episode.seasonNumber,
      number: episode.episodeNumber,
      title: episode.episodeTitle,
    },
  };
}
