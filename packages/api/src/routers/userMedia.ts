import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  addUserWatchHistory,
  deleteUserWatchHistoryByIds,
  findEpisodesByMediaIds,
  findUserListMediaCandidates,
  findMediaByIdWithSeasons,
  findUserMediaStatesByMediaIds,
  findUserPlaybackProgressFeed,
  findUserMediaState,
  findUserPlaybackProgress,
  findUserWatchHistoryByMediaIds,
  findUserWatchHistoryByMedia,
  findUserWatchHistoryFeed,
  upsertUserMediaState,
} from "@canto/core/infrastructure/repositories";

type TrackingStatus = "none" | "planned" | "watching" | "completed" | "dropped";
type WatchedAtMode = "just_now" | "release_date" | "other_date" | "unknown_date";
type MediaType = "movie" | "show";

function parseDateLike(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isReleasedOnOrBefore(value: string | Date | null | undefined, now: Date): boolean {
  const parsed = parseDateLike(value);
  return !parsed || parsed.getTime() <= now.getTime();
}

function resolveWatchedAt(params: {
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

function sourceForMode(mode: WatchedAtMode): "manual" | "release" | "unknown" {
  if (mode === "release_date") return "release";
  if (mode === "unknown_date") return "unknown";
  return "manual";
}

function toMediaType(value: string): MediaType {
  if (value === "movie" || value === "show") return value;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Unsupported media type: ${value}`,
  });
}

function isServerSource(source: string | null): source is "jellyfin" | "plex" {
  return source === "jellyfin" || source === "plex";
}

function toMinuteKey(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return String(Math.floor(parsed.getTime() / 60000));
}

function toDurationSeconds(minutes: number | null | undefined): number | null {
  if (!minutes || minutes <= 0) return null;
  return minutes * 60;
}

function toProgressPercent(current: number, total: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  const percentage = Math.round((current / total) * 100);
  return Math.max(0, Math.min(100, percentage));
}

function computeTrackingStatus(params: {
  mediaType: MediaType;
  history: Array<{ episodeId: string | null }>;
  releasedEpisodeIds: Set<string>;
  markDropped?: boolean;
}): TrackingStatus {
  if (params.markDropped) return "dropped";

  if (params.mediaType === "movie") {
    const hasMovieWatch = params.history.some((event) => event.episodeId === null);
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

export const userMediaRouter = createTRPCRouter({
  getState: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const [state, progress] = await Promise.all([
        findUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
        findUserPlaybackProgress(ctx.db, ctx.session.user.id, input.mediaId),
      ]);

      return {
        mediaId: input.mediaId,
        trackingStatus: state?.status ?? "none",
        rating: state?.rating ?? null,
        progress: progress?.positionSeconds ?? 0,
        isCompleted: progress?.isCompleted ?? false,
        lastWatchedAt: progress?.lastWatchedAt ?? null,
        source: progress?.source ?? null,
      };
    }),

  getHistory: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const history = await findUserWatchHistoryByMedia(
        ctx.db,
        ctx.session.user.id,
        input.mediaId,
      );

      return history.map((event) => ({
        id: event.id,
        episodeId: event.episodeId,
        watchedAt: event.watchedAt,
        source: event.source ?? null,
      }));
    }),

  getLibraryWatchNext: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(24),
        cursor: z.number().int().min(0).nullish(),
        view: z.enum(["all", "continue", "watch_next"]).default("all"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input.limit;
      const cursor = input.cursor ?? 0;
      const view = input.view;
      const now = new Date();

      const [playbackRows, listMediaRows] = await Promise.all([
        findUserPlaybackProgressFeed(ctx.db, userId),
        findUserListMediaCandidates(ctx.db, userId),
      ]);

      const continueMediaIds = new Set<string>();
      const continueItems: Array<{
        id: string;
        kind: "continue";
        mediaId: string;
        mediaType: string;
        title: string;
        posterPath: string | null;
        backdropPath: string | null;
        year: number | null;
        externalId: number;
        provider: string;
        source: "jellyfin" | "plex";
        progressSeconds: number;
        durationSeconds: number | null;
        progressPercent: number | null;
        progressValue: number | null;
        progressTotal: number | null;
        progressUnit: "seconds" | "episodes" | null;
        watchedAt: Date;
        episode:
          | {
              id: string;
              seasonNumber: number | null;
              number: number | null;
              title: string | null;
            }
          | null;
        fromLists: string[];
        sortDate: Date;
      }> = [];

      for (const row of playbackRows) {
        if (!isServerSource(row.source)) continue;
        if (row.isCompleted) continue;
        if (row.positionSeconds <= 0) continue;
        if (!row.lastWatchedAt) continue;
        if (continueMediaIds.has(row.mediaId)) continue;

        const durationSeconds = toDurationSeconds(row.episodeRuntime ?? row.mediaRuntime);

        continueMediaIds.add(row.mediaId);
        continueItems.push({
          id: `continue:${row.id}`,
          kind: "continue",
          mediaId: row.mediaId,
          mediaType: row.mediaType,
          title: row.title,
          posterPath: row.posterPath,
          backdropPath: row.backdropPath,
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

      const listMediaMap = new Map<
        string,
        {
          mediaId: string;
          mediaType: string;
          title: string;
          posterPath: string | null;
          backdropPath: string | null;
          year: number | null;
          externalId: number;
          provider: string;
          addedAt: Date;
          listNames: Set<string>;
        }
      >();

      for (const row of listMediaRows) {
        const existing = listMediaMap.get(row.mediaId);
        if (!existing) {
          listMediaMap.set(row.mediaId, {
            mediaId: row.mediaId,
            mediaType: row.mediaType,
            title: row.title,
            posterPath: row.posterPath,
            backdropPath: row.backdropPath,
            year: row.year,
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

      const candidateMediaIds = [...listMediaMap.keys()];
      const [states, historyRows, episodeRows] = await Promise.all([
        findUserMediaStatesByMediaIds(ctx.db, userId, candidateMediaIds),
        findUserWatchHistoryByMediaIds(ctx.db, userId, candidateMediaIds),
        findEpisodesByMediaIds(
          ctx.db,
          candidateMediaIds.filter(
            (mediaId) => listMediaMap.get(mediaId)?.mediaType === "show",
          ),
        ),
      ]);

      const stateByMediaId = new Map(
        states.map((state) => [state.mediaId, state] as const),
      );

      const historyByMediaId = new Map<
        string,
        Array<{ episodeId: string | null }>
      >();
      for (const row of historyRows) {
        const bucket = historyByMediaId.get(row.mediaId) ?? [];
        bucket.push({ episodeId: row.episodeId });
        historyByMediaId.set(row.mediaId, bucket);
      }

      const episodesByMediaId = new Map<
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
        const bucket = episodesByMediaId.get(row.mediaId) ?? [];
        bucket.push({
          episodeId: row.episodeId,
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          episodeTitle: row.episodeTitle,
          airDate: row.airDate,
        });
        episodesByMediaId.set(row.mediaId, bucket);
      }

      const listItems: Array<{
        id: string;
        kind: "next_episode" | "next_movie";
        mediaId: string;
        mediaType: string;
        title: string;
        posterPath: string | null;
        backdropPath: string | null;
        year: number | null;
        externalId: number;
        provider: string;
        source: "list";
        progressSeconds: number;
        durationSeconds: number | null;
        progressPercent: number | null;
        progressValue: number | null;
        progressTotal: number | null;
        progressUnit: "seconds" | "episodes" | null;
        watchedAt: Date | null;
        episode:
          | {
              id: string;
              seasonNumber: number;
              number: number;
              title: string | null;
            }
          | null;
        fromLists: string[];
        sortDate: Date;
      }> = [];

      for (const candidate of listMediaMap.values()) {
        if (continueMediaIds.has(candidate.mediaId)) continue;

        const state = stateByMediaId.get(candidate.mediaId);
        if (state?.status === "completed" || state?.status === "dropped") continue;

        const mediaHistory = historyByMediaId.get(candidate.mediaId) ?? [];
        const fromLists = [...candidate.listNames];

        if (candidate.mediaType === "movie") {
          const hasMovieHistory = mediaHistory.some(
            (entry) => entry.episodeId === null,
          );
          if (hasMovieHistory) continue;

          listItems.push({
            id: `next-movie:${candidate.mediaId}`,
            kind: "next_movie",
            mediaId: candidate.mediaId,
            mediaType: candidate.mediaType,
            title: candidate.title,
            posterPath: candidate.posterPath,
            backdropPath: candidate.backdropPath,
            year: candidate.year,
            externalId: candidate.externalId,
            provider: candidate.provider,
            source: "list",
            progressSeconds: 0,
            durationSeconds: null,
            progressPercent: null,
            progressValue: null,
            progressTotal: null,
            progressUnit: null,
            watchedAt: null,
            episode: null,
            fromLists,
            sortDate: candidate.addedAt,
          });
          continue;
        }

        const releasedEpisodes = (episodesByMediaId.get(candidate.mediaId) ?? []).filter(
          (episode) => isReleasedOnOrBefore(episode.airDate, now),
        );
        if (releasedEpisodes.length === 0) continue;

        const watchedEpisodeIds = new Set(
          mediaHistory
            .map((entry) => entry.episodeId)
            .filter((episodeId): episodeId is string => !!episodeId),
        );
        const watchedEpisodesCount = watchedEpisodeIds.size;
        const availableEpisodesCount = releasedEpisodes.length;

        const nextEpisode = releasedEpisodes.find(
          (episode) => !watchedEpisodeIds.has(episode.episodeId),
        );
        if (!nextEpisode) continue;

        listItems.push({
          id: `next-episode:${candidate.mediaId}:${nextEpisode.episodeId}`,
          kind: "next_episode",
          mediaId: candidate.mediaId,
          mediaType: candidate.mediaType,
          title: candidate.title,
          posterPath: candidate.posterPath,
          backdropPath: candidate.backdropPath,
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
          watchedAt: null,
          episode: {
            id: nextEpisode.episodeId,
            seasonNumber: nextEpisode.seasonNumber,
            number: nextEpisode.episodeNumber,
            title: nextEpisode.episodeTitle,
          },
          fromLists,
          sortDate: candidate.addedAt,
        });
      }

      const merged = [
        ...continueItems.sort(
          (a, b) => b.sortDate.getTime() - a.sortDate.getTime(),
        ),
        ...listItems.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime()),
      ]
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          backdropPath: item.backdropPath,
          year: item.year,
          externalId: item.externalId,
          provider: item.provider,
          source: item.source,
          progressSeconds: item.progressSeconds,
          durationSeconds: item.durationSeconds,
          progressPercent: item.progressPercent,
          progressValue: item.progressValue,
          progressTotal: item.progressTotal,
          progressUnit: item.progressUnit,
          watchedAt: item.watchedAt,
          episode: item.episode,
          fromLists: item.fromLists,
        }));

      const filtered =
        view === "continue"
          ? merged.filter((item) => item.kind === "continue")
          : view === "watch_next"
            ? merged.filter((item) => item.kind !== "continue")
            : merged;

      const items = filtered.slice(cursor, cursor + limit);
      const nextCursor = cursor + limit < filtered.length ? cursor + limit : undefined;

      return {
        items,
        total: filtered.length,
        nextCursor,
      };
    }),

  getUpcomingSchedule: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(24),
        cursor: z.number().int().min(0).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input.limit;
      const cursor = input.cursor ?? 0;
      const now = new Date();

      const listMediaRows = await findUserListMediaCandidates(ctx.db, userId);

      const listMediaMap = new Map<
        string,
        {
          mediaId: string;
          mediaType: string;
          title: string;
          posterPath: string | null;
          backdropPath: string | null;
          year: number | null;
          releaseDate: string | null;
          externalId: number;
          provider: string;
          addedAt: Date;
          listNames: Set<string>;
        }
      >();

      for (const row of listMediaRows) {
        const existing = listMediaMap.get(row.mediaId);
        if (!existing) {
          listMediaMap.set(row.mediaId, {
            mediaId: row.mediaId,
            mediaType: row.mediaType,
            title: row.title,
            posterPath: row.posterPath,
            backdropPath: row.backdropPath,
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

      const candidateMediaIds = [...listMediaMap.keys()];
      const [states, historyRows, episodeRows] = await Promise.all([
        findUserMediaStatesByMediaIds(ctx.db, userId, candidateMediaIds),
        findUserWatchHistoryByMediaIds(ctx.db, userId, candidateMediaIds),
        findEpisodesByMediaIds(
          ctx.db,
          candidateMediaIds.filter(
            (mediaId) => listMediaMap.get(mediaId)?.mediaType === "show",
          ),
        ),
      ]);

      const stateByMediaId = new Map(
        states.map((state) => [state.mediaId, state] as const),
      );

      const historyByMediaId = new Map<
        string,
        Array<{ episodeId: string | null }>
      >();
      for (const row of historyRows) {
        const bucket = historyByMediaId.get(row.mediaId) ?? [];
        bucket.push({ episodeId: row.episodeId });
        historyByMediaId.set(row.mediaId, bucket);
      }

      const episodesByMediaId = new Map<
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
        const bucket = episodesByMediaId.get(row.mediaId) ?? [];
        bucket.push({
          episodeId: row.episodeId,
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          episodeTitle: row.episodeTitle,
          airDate: row.airDate,
        });
        episodesByMediaId.set(row.mediaId, bucket);
      }

      const scheduleItems: Array<{
        id: string;
        kind: "upcoming_episode" | "upcoming_movie";
        mediaId: string;
        mediaType: string;
        title: string;
        posterPath: string | null;
        backdropPath: string | null;
        year: number | null;
        externalId: number;
        provider: string;
        fromLists: string[];
        releaseAt: Date;
        episode:
          | {
              id: string;
              seasonNumber: number;
              number: number;
              title: string | null;
            }
          | null;
      }> = [];

      for (const candidate of listMediaMap.values()) {
        const state = stateByMediaId.get(candidate.mediaId);
        if (state?.status === "completed" || state?.status === "dropped") continue;

        const mediaHistory = historyByMediaId.get(candidate.mediaId) ?? [];
        const fromLists = [...candidate.listNames];

        if (candidate.mediaType === "movie") {
          const hasMovieHistory = mediaHistory.some(
            (entry) => entry.episodeId === null,
          );
          if (hasMovieHistory) continue;

          const releaseAt = parseDateLike(candidate.releaseDate);
          if (!releaseAt || releaseAt.getTime() <= now.getTime()) continue;

          scheduleItems.push({
            id: `upcoming-movie:${candidate.mediaId}`,
            kind: "upcoming_movie",
            mediaId: candidate.mediaId,
            mediaType: candidate.mediaType,
            title: candidate.title,
            posterPath: candidate.posterPath,
            backdropPath: candidate.backdropPath,
            year: candidate.year,
            externalId: candidate.externalId,
            provider: candidate.provider,
            fromLists,
            releaseAt,
            episode: null,
          });
          continue;
        }

        const watchedEpisodeIds = new Set(
          mediaHistory
            .map((entry) => entry.episodeId)
            .filter((episodeId): episodeId is string => !!episodeId),
        );

        const upcomingEpisodes = (episodesByMediaId.get(candidate.mediaId) ?? [])
          .map((episode) => ({
            ...episode,
            airDate: parseDateLike(episode.airDate),
          }))
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

        if (upcomingEpisodes.length === 0) continue;

        const nextUpcomingEpisode =
          upcomingEpisodes.find(
            (episode) => !watchedEpisodeIds.has(episode.episodeId),
          ) ?? upcomingEpisodes[0];
        if (!nextUpcomingEpisode) continue;

        scheduleItems.push({
          id: `upcoming-episode:${candidate.mediaId}:${nextUpcomingEpisode.episodeId}`,
          kind: "upcoming_episode",
          mediaId: candidate.mediaId,
          mediaType: candidate.mediaType,
          title: candidate.title,
          posterPath: candidate.posterPath,
          backdropPath: candidate.backdropPath,
          year: candidate.year,
          externalId: candidate.externalId,
          provider: candidate.provider,
          fromLists,
          releaseAt: nextUpcomingEpisode.airDate,
          episode: {
            id: nextUpcomingEpisode.episodeId,
            seasonNumber: nextUpcomingEpisode.seasonNumber,
            number: nextUpcomingEpisode.episodeNumber,
            title: nextUpcomingEpisode.episodeTitle,
          },
        });
      }

      const sorted = scheduleItems.sort(
        (a, b) => a.releaseAt.getTime() - b.releaseAt.getTime(),
      );
      const items = sorted.slice(cursor, cursor + limit);
      const nextCursor = cursor + limit < sorted.length ? cursor + limit : undefined;

      return {
        items,
        total: sorted.length,
        nextCursor,
      };
    }),

  getLibraryHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(40),
        cursor: z.number().int().min(0).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input.limit;
      const cursor = input.cursor ?? 0;
      const fetchLimit = Math.max(300, (cursor + limit) * 3);

      const [historyRows, playbackRows] = await Promise.all([
        findUserWatchHistoryFeed(ctx.db, userId, fetchLimit),
        findUserPlaybackProgressFeed(ctx.db, userId),
      ]);

      const timelineEntries: Array<{
        id: string;
        entryType: "history" | "playback";
        mediaId: string;
        mediaType: string;
        title: string;
        posterPath: string | null;
        year: number | null;
        externalId: number;
        provider: string;
        watchedAt: Date;
        source: string | null;
        episode:
          | {
              id: string | null;
              seasonNumber: number | null;
              number: number | null;
              title: string | null;
            }
          | null;
        isCompleted: boolean | null;
        progressSeconds: number | null;
        durationSeconds: number | null;
      }> = [];

      for (const row of historyRows) {
        const serverFallbackEpisode =
          row.mediaType === "show" &&
          !row.episodeId &&
          isServerSource(row.source)
            ? {
                id: `server-unknown:${row.id}`,
                seasonNumber: null,
                number: null,
                title: "Server episode",
              }
            : null;

        if (row.mediaType === "show" && !row.episodeId && !serverFallbackEpisode) {
          continue;
        }

        timelineEntries.push({
          id: row.id,
          entryType: "history",
          mediaId: row.mediaId,
          mediaType: row.mediaType,
          title: row.title,
          posterPath: row.posterPath,
          year: row.year,
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
        });
      }

      for (const row of playbackRows) {
        if (!row.lastWatchedAt) continue;
        if (!row.isCompleted && row.positionSeconds <= 0) continue;
        if (!isServerSource(row.source)) continue;

        const serverFallbackEpisode =
          row.mediaType === "show" && !row.episodeId
            ? {
                id: `server-unknown:playback:${row.id}`,
                seasonNumber: null,
                number: null,
                title: "Server episode",
              }
            : null;

        timelineEntries.push({
          id: `playback:${row.id}`,
          entryType: "playback",
          mediaId: row.mediaId,
          mediaType: row.mediaType,
          title: row.title,
          posterPath: row.posterPath,
          year: row.year,
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
        });
      }

      timelineEntries.sort(
        (a, b) => b.watchedAt.getTime() - a.watchedAt.getTime(),
      );

      const deduped: typeof timelineEntries = [];
      const seen = new Set<string>();
      for (const entry of timelineEntries) {
        const key = `${entry.mediaId}:${entry.episode?.id ?? "movie"}:${toMinuteKey(entry.watchedAt)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(entry);
      }

      const pageItems = deduped.slice(cursor, cursor + limit);
      const showMediaIds = [
        ...new Set(
          pageItems
            .filter((item) => item.mediaType === "show")
            .map((item) => item.mediaId),
        ),
      ];
      const [showHistoryRows, showEpisodeRows] = showMediaIds.length > 0
        ? await Promise.all([
            findUserWatchHistoryByMediaIds(ctx.db, userId, showMediaIds),
            findEpisodesByMediaIds(ctx.db, showMediaIds),
          ])
        : [[], []];

      const watchedEpisodesByMediaId = new Map<string, Set<string>>();
      for (const row of showHistoryRows) {
        if (!row.episodeId) continue;
        const watchedSet = watchedEpisodesByMediaId.get(row.mediaId) ?? new Set<string>();
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

      const items = pageItems.map((item) => {
        if (item.entryType === "playback") {
          const progressSeconds = item.progressSeconds ?? 0;
          const durationSeconds = item.durationSeconds;

          if (item.isCompleted) {
            return {
              ...item,
              progressPercent: 100,
              progressValue: durationSeconds ?? 1,
              progressTotal: durationSeconds ?? 1,
              progressUnit: durationSeconds ? "seconds" as const : null,
            };
          }

          if (durationSeconds !== null && progressSeconds > 0) {
            return {
              ...item,
              progressPercent: toProgressPercent(progressSeconds, durationSeconds),
              progressValue: progressSeconds,
              progressTotal: durationSeconds,
              progressUnit: "seconds" as const,
            };
          }

          return {
            ...item,
            progressPercent: null,
            progressValue: null,
            progressTotal: null,
            progressUnit: null,
          };
        }

        if (item.mediaType === "movie") {
          return {
            ...item,
            progressPercent: 100,
            progressValue: 1,
            progressTotal: 1,
            progressUnit: null,
          };
        }

        const watchedEpisodes = watchedEpisodesByMediaId.get(item.mediaId)?.size ?? 0;
        const hasUnknownServerEpisode =
          typeof item.episode?.id === "string" &&
          item.episode.id.startsWith("server-unknown:");
        const normalizedWatchedEpisodes = hasUnknownServerEpisode
          ? Math.max(watchedEpisodes, 1)
          : watchedEpisodes;
        const availableEpisodes = Math.max(
          normalizedWatchedEpisodes,
          availableEpisodesByMediaId.get(item.mediaId) ?? 0,
        );

        return {
          ...item,
          progressPercent: toProgressPercent(
            normalizedWatchedEpisodes,
            availableEpisodes,
          ),
          progressValue: normalizedWatchedEpisodes,
          progressTotal: availableEpisodes > 0 ? availableEpisodes : null,
          progressUnit: "episodes" as const,
        };
      });
      const nextCursor = cursor + limit < deduped.length ? cursor + limit : undefined;

      return {
        items,
        total: deduped.length,
        nextCursor,
      };
    }),

  updateState: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      trackingStatus: z.enum(["none", "planned", "watching", "completed", "dropped"]).optional(),
      rating: z.number().min(0).max(10).optional(),
      progress: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        ...(input.trackingStatus !== undefined && { status: input.trackingStatus }),
        ...(input.rating !== undefined && { rating: input.rating }),
      });
      return { success: true };
    }),

  rate: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      rating: z.number().min(0).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        rating: input.rating,
      });
      return { success: true };
    }),

  track: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      status: z.enum(["none", "planned", "watching", "completed", "dropped"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: input.status,
      });
      return { success: true };
    }),

  logWatched: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      scope: z.enum(["movie", "show", "season", "episode"]).optional(),
      seasonNumber: z.number().int().min(0).optional(),
      episodeNumber: z.number().int().min(1).optional(),
      selectedEpisodeIds: z.array(z.string()).min(1).optional(),
      watchedAtMode: z.enum(["just_now", "release_date", "other_date", "unknown_date"]).default("just_now"),
      watchedAt: z.string().datetime().optional(),
      markDropped: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.markDropped && (input.scope || input.selectedEpisodeIds)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dropped action cannot include watch scope",
        });
      }

      if (
        !input.markDropped &&
        !input.scope &&
        (!input.selectedEpisodeIds || input.selectedEpisodeIds.length === 0)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide a watch scope or selected episodes",
        });
      }

      if (input.scope === "season" && input.seasonNumber === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Season number is required for season scope",
        });
      }

      if (
        input.scope === "episode" &&
        (input.seasonNumber === undefined || input.episodeNumber === undefined)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Season and episode numbers are required for episode scope",
        });
      }

      if (input.watchedAtMode === "other_date" && !input.watchedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Custom watch date is required for other date mode",
        });
      }

      const mediaWithSeasons = await findMediaByIdWithSeasons(ctx.db, input.mediaId);
      if (!mediaWithSeasons) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      }

      const customWatchedAt = input.watchedAt ? new Date(input.watchedAt) : null;
      if (customWatchedAt && Number.isNaN(customWatchedAt.getTime())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid watched date",
        });
      }

      const episodeIdsToLog: Array<string | null> = [];
      const now = new Date();
      const allEpisodes = mediaWithSeasons.seasons.flatMap((season) => season.episodes);
      const releasedEpisodes = allEpisodes.filter((episode) =>
        isReleasedOnOrBefore(episode.airDate, now),
      );
      const allEpisodeIds = new Set(allEpisodes.map((episode) => episode.id));
      const releasedEpisodeIds = new Set(
        releasedEpisodes.map((episode) => episode.id),
      );
      const episodeById = new Map(
        allEpisodes.map((episode) => [episode.id, episode] as const),
      );
      const mediaReleaseDate = parseDateLike(mediaWithSeasons.releaseDate);

      if (!input.markDropped && input.selectedEpisodeIds?.length) {
        if (mediaWithSeasons.type !== "show") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Episode selection is only valid for TV shows",
          });
        }

        const uniqueSelected = [...new Set(input.selectedEpisodeIds)];
        const invalidEpisode = uniqueSelected.find((episodeId) => !allEpisodeIds.has(episodeId));
        if (invalidEpisode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected episode does not belong to this show",
          });
        }

        const unreleasedEpisode = uniqueSelected.find(
          (episodeId) => !releasedEpisodeIds.has(episodeId),
        );
        if (unreleasedEpisode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot track unreleased episodes",
          });
        }

        episodeIdsToLog.push(...uniqueSelected);
      } else if (!input.markDropped && input.scope) {
        if (input.scope === "movie") {
          if (mediaWithSeasons.type !== "movie") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Movie scope is only valid for movies",
            });
          }
          episodeIdsToLog.push(null);
        }

        if (input.scope === "show") {
          if (mediaWithSeasons.type !== "show") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Show scope is only valid for TV shows",
            });
          }
          episodeIdsToLog.push(...releasedEpisodes.map((episode) => episode.id));
        }

        if (input.scope === "season") {
          if (mediaWithSeasons.type !== "show") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Season scope is only valid for TV shows",
            });
          }
          const season = mediaWithSeasons.seasons.find(
            (item) => item.number === input.seasonNumber,
          );
          if (!season) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Season not found",
            });
          }
          episodeIdsToLog.push(
            ...season.episodes
              .filter((episode) => isReleasedOnOrBefore(episode.airDate, now))
              .map((episode) => episode.id),
          );
        }

        if (input.scope === "episode") {
          if (mediaWithSeasons.type !== "show") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Episode scope is only valid for TV shows",
            });
          }
          const season = mediaWithSeasons.seasons.find(
            (item) => item.number === input.seasonNumber,
          );
          if (!season) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Season not found",
            });
          }
          const episode = season.episodes.find(
            (item) => item.number === input.episodeNumber,
          );
          if (!episode) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Episode not found",
            });
          }
          if (!isReleasedOnOrBefore(episode.airDate, now)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot track an unreleased episode",
            });
          }
          episodeIdsToLog.push(episode.id);
        }

        if (episodeIdsToLog.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No released episodes found to record",
          });
        }
      }

      if (!input.markDropped) {
        const source = sourceForMode(input.watchedAtMode);
        await Promise.all(
          episodeIdsToLog.map((episodeId) =>
            addUserWatchHistory(ctx.db, {
              userId: ctx.session.user.id,
              mediaId: input.mediaId,
              episodeId,
              watchedAt: resolveWatchedAt({
                mode: input.watchedAtMode,
                customDate: customWatchedAt,
                mediaReleaseDate,
                episodeAirDate:
                  episodeId && mediaWithSeasons.type === "show"
                    ? parseDateLike(episodeById.get(episodeId)?.airDate)
                    : null,
              }),
              source,
            }),
          ),
        );
      }

      const history = await findUserWatchHistoryByMedia(
        ctx.db,
        ctx.session.user.id,
        input.mediaId,
      );
      const mediaType = toMediaType(mediaWithSeasons.type);

      const computedStatus = computeTrackingStatus({
        mediaType,
        history,
        releasedEpisodeIds,
        markDropped: input.markDropped,
      });

      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: computedStatus,
      });

      const latestHistoryDate = history[0]?.watchedAt ?? null;
      const trackedItems = input.markDropped ? 0 : episodeIdsToLog.length;

      const [state, progress] = await Promise.all([
        findUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
        findUserPlaybackProgress(ctx.db, ctx.session.user.id, input.mediaId),
      ]);

      return {
        success: true,
        trackedItems,
        state: {
          mediaId: input.mediaId,
          trackingStatus: state?.status ?? "none",
          rating: state?.rating ?? null,
          progress: progress?.positionSeconds ?? 0,
          isCompleted: progress?.isCompleted ?? false,
          lastWatchedAt: progress?.lastWatchedAt ?? latestHistoryDate,
          source:
            progress?.source ??
            (trackedItems > 0 ? sourceForMode(input.watchedAtMode) : null),
        },
      };
    }),

  removeHistoryEntries: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      entryIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const mediaWithSeasons = await findMediaByIdWithSeasons(ctx.db, input.mediaId);
      if (!mediaWithSeasons) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      }

      const removedItems = await deleteUserWatchHistoryByIds(
        ctx.db,
        ctx.session.user.id,
        input.mediaId,
        [...new Set(input.entryIds)],
      );

      const now = new Date();
      const releasedEpisodeIds = new Set(
        mediaWithSeasons.seasons
          .flatMap((season) => season.episodes)
          .filter((episode) => isReleasedOnOrBefore(episode.airDate, now))
          .map((episode) => episode.id),
      );

      const history = await findUserWatchHistoryByMedia(
        ctx.db,
        ctx.session.user.id,
        input.mediaId,
      );
      const mediaType = toMediaType(mediaWithSeasons.type);

      const computedStatus = computeTrackingStatus({
        mediaType,
        history,
        releasedEpisodeIds,
      });

      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: computedStatus,
      });

      const [state, progress] = await Promise.all([
        findUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
        findUserPlaybackProgress(ctx.db, ctx.session.user.id, input.mediaId),
      ]);

      return {
        success: true,
        removedItems,
        state: {
          mediaId: input.mediaId,
          trackingStatus: state?.status ?? "none",
          rating: state?.rating ?? null,
          progress: progress?.positionSeconds ?? 0,
          isCompleted: progress?.isCompleted ?? false,
          lastWatchedAt: progress?.lastWatchedAt ?? history[0]?.watchedAt ?? null,
          source: progress?.source ?? null,
        },
      };
    }),

  markDropped: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: "dropped",
      });

      const [state, progress] = await Promise.all([
        findUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
        findUserPlaybackProgress(ctx.db, ctx.session.user.id, input.mediaId),
      ]);

      return {
        success: true,
        state: {
          mediaId: input.mediaId,
          trackingStatus: state?.status ?? "none",
          rating: state?.rating ?? null,
          progress: progress?.positionSeconds ?? 0,
          isCompleted: progress?.isCompleted ?? false,
          lastWatchedAt: progress?.lastWatchedAt ?? null,
          source: progress?.source ?? null,
        },
      };
    }),

  clearTracking: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: "none",
      });

      const [state, progress] = await Promise.all([
        findUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
        findUserPlaybackProgress(ctx.db, ctx.session.user.id, input.mediaId),
      ]);

      return {
        success: true,
        state: {
          mediaId: input.mediaId,
          trackingStatus: state?.status ?? "none",
          rating: state?.rating ?? null,
          progress: progress?.positionSeconds ?? 0,
          isCompleted: progress?.isCompleted ?? false,
          lastWatchedAt: progress?.lastWatchedAt ?? null,
          source: progress?.source ?? null,
        },
      };
    }),
});
