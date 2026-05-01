import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import {
  episode,
  episodeLocalization,
  media,
  mediaFile,
  season,
  seasonLocalization,
  userPlaybackProgress,
  userRating,
  userWatchHistory,
} from "@canto/db/schema";
import type {
  ExistingSeasonStructure,
  TvdbOverlayRepositoryPort,
} from "@canto/core/domain/media/ports/tvdb-overlay-repository.port";

export function makeTvdbOverlayRepository(
  db: Database,
): TvdbOverlayRepositoryPort {
  return {
    findStructureWithEpisodes: async (mediaId) => {
      const rows = await db.query.season.findMany({
        where: eq(season.mediaId, mediaId),
        with: {
          episodes: {
            columns: { id: true, number: true, absoluteNumber: true },
          },
        },
      });
      return rows.map(
        (s): ExistingSeasonStructure => ({
          id: s.id,
          number: s.number,
          episodes: s.episodes.map((e) => ({
            id: e.id,
            number: e.number,
            absoluteNumber: e.absoluteNumber,
          })),
        }),
      );
    },

    findEpisodeLocalizationsByEpisodeIds: async (episodeIds) => {
      if (episodeIds.length === 0) return [];
      const rows = await db
        .select({
          episodeId: episodeLocalization.episodeId,
          language: episodeLocalization.language,
          title: episodeLocalization.title,
          overview: episodeLocalization.overview,
        })
        .from(episodeLocalization)
        .where(
          sql`${episodeLocalization.episodeId} IN (${sql.join(
            episodeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      return rows;
    },

    findSeasonLocalizationsBySeasonIds: async (seasonIds) => {
      if (seasonIds.length === 0) return [];
      const rows = await db
        .select({
          seasonId: seasonLocalization.seasonId,
          language: seasonLocalization.language,
          name: seasonLocalization.name,
          overview: seasonLocalization.overview,
        })
        .from(seasonLocalization)
        .where(
          sql`${seasonLocalization.seasonId} IN (${sql.join(
            seasonIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      return rows;
    },

    detachAndCollectEpisodeRefs: async (episodeIds) => {
      if (episodeIds.length === 0) {
        return { files: [], playback: [], history: [], ratings: [] };
      }
      const epIdIn = sql`IN (${sql.join(
        episodeIds.map((id) => sql`${id}`),
        sql`, `,
      )})`;

      const fileRows = await db.query.mediaFile.findMany({
        where: sql`${mediaFile.episodeId} ${epIdIn}`,
        columns: { id: true, episodeId: true },
      });
      const files = fileRows
        .filter((r): r is { id: string; episodeId: string } => r.episodeId !== null)
        .map((r) => ({ rowId: r.id, oldEpisodeId: r.episodeId }));
      if (files.length > 0) {
        await db
          .update(mediaFile)
          .set({ episodeId: null })
          .where(sql`${mediaFile.episodeId} ${epIdIn}`);
      }

      const playbackRows = await db.query.userPlaybackProgress.findMany({
        where: sql`${userPlaybackProgress.episodeId} ${epIdIn}`,
        columns: { id: true, episodeId: true },
      });
      const playback = playbackRows
        .filter((r): r is { id: string; episodeId: string } => r.episodeId !== null)
        .map((r) => ({ rowId: r.id, oldEpisodeId: r.episodeId }));
      if (playback.length > 0) {
        await db
          .update(userPlaybackProgress)
          .set({ episodeId: null })
          .where(sql`${userPlaybackProgress.episodeId} ${epIdIn}`);
      }

      const historyRows = await db.query.userWatchHistory.findMany({
        where: sql`${userWatchHistory.episodeId} ${epIdIn}`,
        columns: { id: true, episodeId: true },
      });
      const history = historyRows
        .filter((r): r is { id: string; episodeId: string } => r.episodeId !== null)
        .map((r) => ({ rowId: r.id, oldEpisodeId: r.episodeId }));
      if (history.length > 0) {
        await db
          .update(userWatchHistory)
          .set({ episodeId: null })
          .where(sql`${userWatchHistory.episodeId} ${epIdIn}`);
      }

      const ratingRows = await db.query.userRating.findMany({
        where: sql`${userRating.episodeId} ${epIdIn}`,
        columns: { id: true, episodeId: true, seasonId: true },
      });
      const ratings = ratingRows
        .filter((r): r is { id: string; episodeId: string; seasonId: string | null } =>
          r.episodeId !== null,
        )
        .map((r) => ({
          rowId: r.id,
          oldEpisodeId: r.episodeId,
          oldSeasonId: r.seasonId,
        }));
      if (ratings.length > 0) {
        await db
          .update(userRating)
          .set({ episodeId: null, seasonId: null })
          .where(sql`${userRating.episodeId} ${epIdIn}`);
      }

      return { files, playback, history, ratings };
    },

    detachAndCollectSeasonOnlyRatings: async (seasonIds) => {
      if (seasonIds.length === 0) return [];
      const seasonIdIn = sql`IN (${sql.join(
        seasonIds.map((id) => sql`${id}`),
        sql`, `,
      )})`;
      const rows = await db.query.userRating.findMany({
        where: and(
          sql`${userRating.seasonId} ${seasonIdIn}`,
          isNull(userRating.episodeId),
        ),
        columns: { id: true, seasonId: true },
      });
      const collected = rows
        .filter((r): r is { id: string; seasonId: string } => r.seasonId !== null)
        .map((r) => ({ rowId: r.id, oldSeasonId: r.seasonId }));
      if (rows.length > 0) {
        await db
          .update(userRating)
          .set({ seasonId: null })
          .where(sql`${userRating.seasonId} ${seasonIdIn}`);
      }
      return collected;
    },

    replaceSeasons: async (mediaId, insertNewStructure) => {
      await db.transaction(async (tx) => {
        await tx.delete(season).where(eq(season.mediaId, mediaId));
        // The insertNewStructure callback writes via the caller's media port
        // (not the tx-scoped clone). The surrounding transaction is enforced
        // by the underlying connection — same semantic as the legacy
        // implementation this adapter replaces.
        await insertNewStructure();
      });
    },

    updateMediaSeasonCounts: async (
      mediaId,
      numberOfSeasons,
      numberOfEpisodes,
    ) => {
      await db
        .update(media)
        .set({ numberOfSeasons, numberOfEpisodes, updatedAt: new Date() })
        .where(eq(media.id, mediaId));
    },

    reattachMediaFile: async (rowId, episodeId) => {
      await db
        .update(mediaFile)
        .set({ episodeId })
        .where(eq(mediaFile.id, rowId));
    },

    reattachUserPlayback: async (rowId, episodeId) => {
      await db
        .update(userPlaybackProgress)
        .set({ episodeId })
        .where(eq(userPlaybackProgress.id, rowId));
    },

    reattachUserWatchHistory: async (rowId, episodeId) => {
      await db
        .update(userWatchHistory)
        .set({ episodeId })
        .where(eq(userWatchHistory.id, rowId));
    },

    reattachUserRating: async (rowId, ids) => {
      await db
        .update(userRating)
        .set({
          ...(ids.episodeId ? { episodeId: ids.episodeId } : {}),
          ...(ids.seasonId ? { seasonId: ids.seasonId } : {}),
        })
        .where(eq(userRating.id, rowId));
    },

    patchEpisode: async (id, patch) => {
      await db
        .update(episode)
        .set({
          ...(patch.stillPath ? { stillPath: patch.stillPath } : {}),
          ...(patch.voteAverage !== undefined
            ? { voteAverage: patch.voteAverage }
            : {}),
          ...(patch.voteCount !== undefined
            ? { voteCount: patch.voteCount }
            : {}),
          ...(patch.episodeType ? { episodeType: patch.episodeType } : {}),
          ...(patch.crew ? { crew: patch.crew } : {}),
          ...(patch.guestStars ? { guestStars: patch.guestStars } : {}),
        })
        .where(eq(episode.id, id));
    },

    patchSeasonVoteAverage: async (seasonId, voteAverage) => {
      await db
        .update(season)
        .set({ voteAverage })
        .where(eq(season.id, seasonId));
    },
  };
}
