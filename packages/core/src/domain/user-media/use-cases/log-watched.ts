import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import {
  EpisodeNotFoundError,
  InvalidWatchInputError,
  SeasonNotFoundError,
} from "@canto/core/domain/user-media/errors";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import {
  computeTrackingStatus,
  isMediaType,
  isReleasedOnOrBefore,
  parseDateLike,
  resolveWatchedAt,
  sourceForMode
  
  
} from "@canto/core/domain/user-media/rules/user-media-rules";
import type {MediaType, WatchedAtMode} from "@canto/core/domain/user-media/rules/user-media-rules";
import {
  getUserMediaState
  
} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import type {UserMediaStateResponse} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import { pushWatchStateToServers } from "@canto/core/domain/user-media/use-cases/push-watch-state";

export interface LogWatchedDeps {
  repo: UserMediaRepositoryPort;
  mediaRepo: MediaRepositoryPort;
}

export interface LogWatchedInput {
  mediaId: string;
  scope?: "movie" | "show" | "season" | "episode";
  seasonNumber?: number;
  episodeNumber?: number;
  selectedEpisodeIds?: string[];
  watchedAtMode: WatchedAtMode;
  watchedAt?: string;
  markDropped: boolean;
  rating?: number;
  comment?: string;
}

export interface LogWatchedResult {
  success: true;
  trackedItems: number;
  state: UserMediaStateResponse;
}

type MediaWithSeasons = NonNullable<
  Awaited<ReturnType<MediaRepositoryPort["findByIdWithSeasons"]>>
>;

export async function logWatched(
  db: Database,
  deps: LogWatchedDeps,
  userId: string,
  input: LogWatchedInput,
): Promise<LogWatchedResult> {
  validateLogWatchedShape(input);

  const media = await deps.mediaRepo.findByIdWithSeasons(input.mediaId);
  if (!media) throw new MediaNotFoundError(input.mediaId);
  if (!isMediaType(media.type)) {
    throw new InvalidWatchInputError(`Unsupported media type: ${media.type}`);
  }

  const customWatchedAt = parseCustomWatchedAt(input.watchedAt);
  const now = new Date();
  const allEpisodes = media.seasons.flatMap((s) => s.episodes);
  const releasedEpisodes = allEpisodes.filter((episode) =>
    isReleasedOnOrBefore(episode.airDate, now),
  );
  const episodeIdsToLog = input.markDropped
    ? []
    : resolveEpisodesToLog(input, media, allEpisodes, releasedEpisodes, now);

  if (!input.markDropped) {
    await persistWatchHistory(deps, userId, input, media, episodeIdsToLog, customWatchedAt);
  }

  const releasedEpisodeIds = new Set(releasedEpisodes.map((e) => e.id));
  const history = await deps.repo.findHistoryByMedia(userId, input.mediaId);
  const computedStatus = computeTrackingStatus({
    mediaType: media.type,
    history,
    releasedEpisodeIds,
    markDropped: input.markDropped,
  });

  await deps.repo.upsertState({
    userId,
    mediaId: input.mediaId,
    status: computedStatus,
  });

  if (!input.markDropped && computedStatus === "completed") {
    void pushWatchStateToServers(db, userId, input.mediaId, true).catch(
      logAndSwallow("userMedia.logWatched:pushWatchStateToServers"),
    );
  }

  if (input.rating && !input.markDropped) {
    await applyRating(deps, userId, input, media, episodeIdsToLog);
  }

  const state = await getUserMediaState(deps, userId, input.mediaId);
  const latestHistoryDate = history[0]?.watchedAt ?? null;
  const trackedItems = input.markDropped ? 0 : episodeIdsToLog.length;

  return {
    success: true,
    trackedItems,
    state: {
      ...state,
      lastWatchedAt: state.lastWatchedAt ?? latestHistoryDate,
      source:
        state.source ??
        (trackedItems > 0 ? sourceForMode(input.watchedAtMode) : null),
    },
  };
}

function validateLogWatchedShape(input: LogWatchedInput): void {
  if (input.markDropped && (input.scope || input.selectedEpisodeIds)) {
    throw new InvalidWatchInputError("Dropped action cannot include watch scope");
  }
  if (
    !input.markDropped &&
    !input.scope &&
    (!input.selectedEpisodeIds || input.selectedEpisodeIds.length === 0)
  ) {
    throw new InvalidWatchInputError("Provide a watch scope or selected episodes");
  }
  if (input.scope === "season" && input.seasonNumber === undefined) {
    throw new InvalidWatchInputError("Season number is required for season scope");
  }
  if (
    input.scope === "episode" &&
    (input.seasonNumber === undefined || input.episodeNumber === undefined)
  ) {
    throw new InvalidWatchInputError(
      "Season and episode numbers are required for episode scope",
    );
  }
  if (input.watchedAtMode === "other_date" && !input.watchedAt) {
    throw new InvalidWatchInputError(
      "Custom watch date is required for other date mode",
    );
  }
}

function parseCustomWatchedAt(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidWatchInputError("Invalid watched date");
  }
  return parsed;
}

function resolveEpisodesToLog(
  input: LogWatchedInput,
  media: MediaWithSeasons,
  allEpisodes: MediaWithSeasons["seasons"][number]["episodes"],
  releasedEpisodes: MediaWithSeasons["seasons"][number]["episodes"],
  now: Date,
): Array<string | null> {
  const allEpisodeIds = new Set<string>(allEpisodes.map((e) => e.id));
  const releasedEpisodeIds = new Set<string>(releasedEpisodes.map((e) => e.id));

  if (input.selectedEpisodeIds?.length) {
    if (media.type !== "show") {
      throw new InvalidWatchInputError(
        "Episode selection is only valid for TV shows",
      );
    }
    const unique = [...new Set(input.selectedEpisodeIds)];
    const invalid = unique.find((id) => !allEpisodeIds.has(id));
    if (invalid) {
      throw new InvalidWatchInputError(
        "Selected episode does not belong to this show",
      );
    }
    const unreleased = unique.find((id) => !releasedEpisodeIds.has(id));
    if (unreleased) {
      throw new InvalidWatchInputError("Cannot track unreleased episodes");
    }
    return unique;
  }

  if (!input.scope) return [];

  if (input.scope === "movie") {
    if (media.type !== "movie") {
      throw new InvalidWatchInputError("Movie scope is only valid for movies");
    }
    return [null];
  }

  if (media.type !== "show") {
    throw new InvalidWatchInputError(
      `${input.scope} scope is only valid for TV shows`,
    );
  }

  if (input.scope === "show") {
    const ids = releasedEpisodes.map((e) => e.id);
    if (ids.length === 0) {
      throw new InvalidWatchInputError("No released episodes found to record");
    }
    return ids;
  }

  const season = media.seasons.find((s) => s.number === input.seasonNumber);
  if (!season) throw new SeasonNotFoundError(input.seasonNumber);

  if (input.scope === "season") {
    const ids = season.episodes
      .filter((ep) => isReleasedOnOrBefore(ep.airDate, now))
      .map((ep) => ep.id);
    if (ids.length === 0) {
      throw new InvalidWatchInputError("No released episodes found to record");
    }
    return ids;
  }

  // episode scope
  const episode = season.episodes.find((e) => e.number === input.episodeNumber);
  if (!episode) throw new EpisodeNotFoundError();
  if (!isReleasedOnOrBefore(episode.airDate, now)) {
    throw new InvalidWatchInputError("Cannot track an unreleased episode");
  }
  return [episode.id];
}

async function persistWatchHistory(
  deps: LogWatchedDeps,
  userId: string,
  input: LogWatchedInput,
  media: MediaWithSeasons,
  episodeIdsToLog: Array<string | null>,
  customWatchedAt: Date | null,
): Promise<void> {
  const source = sourceForMode(input.watchedAtMode);
  const mediaReleaseDate = parseDateLike(media.releaseDate);
  const episodeById = new Map<string, MediaWithSeasons["seasons"][number]["episodes"][number]>(
    media.seasons.flatMap((s) => s.episodes.map((e) => [e.id, e] as const)),
  );

  await Promise.all(
    episodeIdsToLog.map((episodeId) =>
      deps.repo.addHistoryEntry({
        userId,
        mediaId: input.mediaId,
        episodeId,
        watchedAt: resolveWatchedAt({
          mode: input.watchedAtMode,
          customDate: customWatchedAt,
          mediaReleaseDate,
          episodeAirDate:
            episodeId && media.type === "show"
              ? parseDateLike(episodeById.get(episodeId)?.airDate)
              : null,
        }),
        source,
      }),
    ),
  );
}

async function applyRating(
  deps: LogWatchedDeps,
  userId: string,
  input: LogWatchedInput,
  media: MediaWithSeasons,
  episodeIdsToLog: Array<string | null>,
): Promise<void> {
  if (!input.rating) return;

  if (input.scope === "episode" && episodeIdsToLog.length === 1) {
    const episodeId = episodeIdsToLog[0];
    if (!episodeId) return;
    const season = media.seasons.find((s) =>
      s.episodes.some((e) => e.id === episodeId),
    );
    await deps.repo.upsertRating({
      userId,
      mediaId: input.mediaId,
      seasonId: season?.id ?? null,
      episodeId,
      rating: input.rating,
      comment: input.comment ?? null,
      isOverride: true,
    });
    if (season) {
      await deps.repo.computeAndSyncSeasonRating(userId, input.mediaId, season.id);
    }
    return;
  }

  if (input.scope === "season" && input.seasonNumber !== undefined) {
    const season = media.seasons.find((s) => s.number === input.seasonNumber);
    if (!season) return;
    await deps.repo.upsertRating({
      userId,
      mediaId: input.mediaId,
      seasonId: season.id,
      episodeId: null,
      rating: input.rating,
      comment: input.comment ?? null,
      isOverride: true,
    });
    await deps.repo.computeAndSyncMediaRating(userId, input.mediaId);
    return;
  }

  await deps.repo.upsertRating({
    userId,
    mediaId: input.mediaId,
    seasonId: null,
    episodeId: null,
    rating: input.rating,
    comment: input.comment ?? null,
    isOverride: true,
  });
  await deps.repo.upsertState({
    userId,
    mediaId: input.mediaId,
    rating: input.rating,
  });
}
