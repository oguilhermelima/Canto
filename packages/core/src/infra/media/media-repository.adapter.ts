import { and, eq, inArray, isNotNull, sql  } from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { episode, media, mediaFile, season } from "@canto/db/schema";
import type { MediaType } from "@canto/core/domain/media/types/media";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import {
  deleteMedia as deleteMediaInfra,
  findDownloadedLibraryMedia as findDownloadedLibraryMediaInfra,
  findEpisodeIdByMediaAndNumbers as findEpisodeIdByMediaAndNumbersInfra,
  findEpisodeNumbersById as findEpisodeNumbersByIdInfra,
  findMediaByAnyReference as findMediaByAnyReferenceInfra,
  findMediaByExternalId as findMediaByExternalIdInfra,
  findMediaById as findMediaByIdInfra,
  findMediaByIdWithSeasons as findMediaByIdWithSeasonsInfra,
  findMonitoredShowsForRss as findMonitoredShowsForRssInfra,
  isMediaOrphaned as isMediaOrphanedInfra,
  listLibraryMedia as listLibraryMediaInfra,
  updateMedia as updateMediaInfra,
} from "@canto/core/infra/media/media-repository";
import {
  toDomain as mediaToDomain,
  toLibraryExternalIdRef,
  toLibraryMediaBrief,
  toRow as mediaToRow,
  toUpdateRow as mediaToUpdateRow,
} from "@canto/core/infra/media/media.mapper";
import {
  toDomain as seasonToDomain,
  toDomainWithEpisodes as seasonToDomainWithEpisodes,
  toRow as seasonToRow,
} from "@canto/core/infra/media/season.mapper";
import {
  toDomain as episodeToDomain,
  toPatchRow as episodeToPatchRow,
  toRow as episodeToRow,
} from "@canto/core/infra/media/episode.mapper";

type RawSeasonWithEpisodes = typeof season.$inferSelect & {
  episodes: (typeof episode.$inferSelect)[];
};

type RawMediaWithSeasons = typeof media.$inferSelect & {
  seasons: RawSeasonWithEpisodes[];
};

function hydrateMediaWithSeasons(row: RawMediaWithSeasons) {
  return {
    ...mediaToDomain(row),
    seasons: row.seasons.map(seasonToDomainWithEpisodes),
  };
}

export function makeMediaRepository(db: Database): MediaRepositoryPort {
  return {
    // ─── Reads ───
    findById: async (id) => {
      const row = await findMediaByIdInfra(db, id);
      return row ? mediaToDomain(row) : null;
    },

    findByIdWithSeasons: async (id) => {
      const row = await findMediaByIdWithSeasonsInfra(db, id);
      return row ? hydrateMediaWithSeasons(row as RawMediaWithSeasons) : null;
    },

    findByExternalId: async (externalId, provider, type) => {
      const row = await findMediaByExternalIdInfra(db, externalId, provider, type);
      return row ? hydrateMediaWithSeasons(row as RawMediaWithSeasons) : null;
    },

    findIdsByExternalIdsForProvider: async (externalIds, provider) => {
      if (externalIds.length === 0) return [];
      const rows = await db
        .select({ id: media.id, externalId: media.externalId })
        .from(media)
        .where(and(inArray(media.externalId, externalIds), eq(media.provider, provider)));
      return rows.map((r) => ({ externalId: r.externalId, id: r.id }));
    },

    findByAnyReference: async (externalId, provider, imdbId, tvdbId, type) => {
      const row = await findMediaByAnyReferenceInfra(
        db,
        externalId,
        provider,
        imdbId,
        tvdbId,
        type,
      );
      return row ? hydrateMediaWithSeasons(row as RawMediaWithSeasons) : null;
    },

    // ─── Writes ───
    createMedia: async (input) => {
      const [row] = await db.insert(media).values(mediaToRow(input)).returning();
      if (!row) throw new Error("createMedia: insert returned no row");
      return mediaToDomain(row);
    },

    tryCreateMedia: async (input) => {
      const [row] = await db
        .insert(media)
        .values(mediaToRow(input))
        .onConflictDoNothing()
        .returning();
      return row ? mediaToDomain(row) : null;
    },

    updateMedia: async (id, input) => {
      const row = await updateMediaInfra(db, id, mediaToUpdateRow(input));
      return row ? mediaToDomain(row) : null;
    },

    deleteMedia: async (id) => {
      await deleteMediaInfra(db, id);
    },

    hasTvdbReconciledStructure: async (mediaId) => {
      const row = await db.query.season.findFirst({
        where: and(
          eq(season.mediaId, mediaId),
          inArray(season.seasonType, ["official", "default"]),
        ),
        columns: { id: true },
      });
      return row !== undefined;
    },

    // ─── Library projections ───
    findLibraryExternalIds: async () => {
      const rows = await db.query.media.findMany({
        where: eq(media.inLibrary, true),
        columns: { externalId: true, provider: true },
      });
      return rows.map(toLibraryExternalIdRef);
    },

    findLibraryMediaBrief: async (limit = 100) => {
      const rows = await db.query.media.findMany({
        where: eq(media.inLibrary, true),
        columns: { id: true, externalId: true, provider: true, type: true },
        limit,
      });
      return rows.map(toLibraryMediaBrief);
    },

    /**
     * TODO(wave 9b/8): The storage scan crosses into `media_file` (Wave 8
     * territory). Surfacing here keeps the existing call shape; the eventual
     * home is an aggregate read on the listing port.
     */
    findLibraryStats: async () => {
      const [statsRows, [storageRow]] = await Promise.all([
        db
          .select({
            total:
              sql<number>`COUNT(*) FILTER (WHERE ${media.inLibrary} = true)`.mapWith(
                Number,
              ),
            movies:
              sql<number>`COUNT(*) FILTER (WHERE ${media.inLibrary} = true AND ${media.type} = 'movie')`.mapWith(
                Number,
              ),
            shows:
              sql<number>`COUNT(*) FILTER (WHERE ${media.inLibrary} = true AND ${media.type} = 'show')`.mapWith(
                Number,
              ),
          })
          .from(media),
        db
          .select({
            totalBytes: sql<string>`COALESCE(SUM(${mediaFile.sizeBytes}), 0)`,
          })
          .from(mediaFile),
      ]);

      const statsRow = statsRows[0];
      return {
        total: statsRow?.total ?? 0,
        movies: statsRow?.movies ?? 0,
        shows: statsRow?.shows ?? 0,
        storageBytes: BigInt(storageRow?.totalBytes ?? "0"),
      };
    },

    findShowIdsInLibrary: async () => {
      const rows = await db
        .select({ id: media.id })
        .from(media)
        .where(and(eq(media.inLibrary, true), eq(media.type, "show")));
      return rows.map((r) => r.id);
    },

    /**
     * Wave 9C2: paginated + filtered library listing. Delegates to the
     * existing infra helper which JOINs `media_localization` for the
     * user-lang overlay; the port projection is shape-compatible.
     */
    listLibraryMedia: async (input, language, userId) => {
      const result = await listLibraryMediaInfra(db, input, language, userId);
      return {
        ...result,
        items: result.items.map((row) => ({
          ...mediaToDomain(row),
          title: row.title,
          overview: row.overview,
          posterPath: row.posterPath,
          logoPath: row.logoPath,
          tagline: row.tagline,
        })),
      };
    },

    findMonitoredShowsForRss: async () => {
      const rows = await findMonitoredShowsForRssInfra(db);
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        externalId: r.externalId,
        provider: r.provider,
        type: r.type,
        originCountry: r.originCountry,
        originalLanguage: r.originalLanguage,
        genres: r.genres,
        genreIds: r.genreIds,
      }));
    },

    findDownloadedLibraryMedia: async () => {
      return findDownloadedLibraryMediaInfra(db);
    },

    findEligibleForEnrichment: async (filter) => {
      const conditions: SQL[] = [];
      if (filter.mediaIds && filter.mediaIds.length > 0) {
        conditions.push(inArray(media.id, filter.mediaIds));
      }
      if (filter.type) conditions.push(eq(media.type, filter.type));
      if (filter.hasTvdbId) conditions.push(isNotNull(media.tvdbId));
      if (filter.onlyInLibrary) conditions.push(eq(media.inLibrary, true));

      const rows = await db
        .select({ id: media.id, type: media.type, tvdbId: media.tvdbId })
        .from(media)
        .where(conditions.length > 0 ? and(...conditions) : sql`TRUE`);

      return rows.map((r) => ({
        id: r.id,
        type: r.type as MediaType,
        tvdbId: r.tvdbId,
      }));
    },

    // ─── Cross-context bridges ───
    /**
     * TODO(wave 9b/8): Crosses into `media_version` + `download` (Wave 8
     * tables). Re-homing depends on whether orphan logic eventually moves
     * to a coordinated cross-context use case.
     */
    isMediaOrphaned: async (mediaId, excludeVersionId) => {
      return isMediaOrphanedInfra(db, mediaId, excludeVersionId);
    },

    // ─── Season reads ───
    countSeasonsByMediaId: async (mediaId) => {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(season)
        .where(eq(season.mediaId, mediaId));
      return row?.n ?? 0;
    },

    countEpisodesByMediaId: async (mediaId) => {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(episode)
        .innerJoin(season, eq(episode.seasonId, season.id))
        .where(eq(season.mediaId, mediaId));
      return row?.n ?? 0;
    },

    findSeasonsByMediaId: async (mediaId) => {
      const rows = await db.query.season.findMany({
        where: eq(season.mediaId, mediaId),
        orderBy: (s, { asc }) => [asc(s.number)],
        with: {
          episodes: {
            orderBy: (e, { asc }) => [asc(e.number)],
          },
        },
      });
      return rows.map(seasonToDomainWithEpisodes);
    },

    // ─── Episode reads ───
    findEpisodeIdByMediaAndNumbers: (mediaId, seasonNumber, episodeNumber) =>
      findEpisodeIdByMediaAndNumbersInfra(
        db,
        mediaId,
        seasonNumber,
        episodeNumber,
      ),

    findEpisodeNumbersById: (episodeId) =>
      findEpisodeNumbersByIdInfra(db, episodeId),

    // ─── Season writes ───
    createSeason: async (input) => {
      const [row] = await db
        .insert(season)
        .values(seasonToRow(input))
        .returning();
      if (!row) throw new Error("createSeason: insert returned no row");
      return seasonToDomain(row);
    },

    upsertSeason: async (input) => {
      const [row] = await db
        .insert(season)
        .values(seasonToRow(input))
        .onConflictDoUpdate({
          target: [season.mediaId, season.number],
          set: {
            externalId: sql`EXCLUDED.external_id`,
            name: sql`EXCLUDED.name`,
            overview: sql`EXCLUDED.overview`,
            airDate: sql`EXCLUDED.air_date`,
            posterPath: sql`COALESCE(EXCLUDED.poster_path, ${season.posterPath})`,
            episodeCount: sql`EXCLUDED.episode_count`,
            seasonType: sql`EXCLUDED.season_type`,
            voteAverage: sql`COALESCE(EXCLUDED.vote_average, ${season.voteAverage})`,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error("upsertSeason: insert returned no row");
      return seasonToDomain(row);
    },

    // ─── Episode writes ───
    createEpisode: async (input) => {
      const [row] = await db
        .insert(episode)
        .values(episodeToRow(input))
        .returning();
      if (!row) throw new Error("createEpisode: insert returned no row");
      return episodeToDomain(row);
    },

    upsertEpisode: async (input) => {
      const [row] = await db
        .insert(episode)
        .values(episodeToRow(input))
        .onConflictDoUpdate({
          target: [episode.seasonId, episode.number],
          set: {
            externalId: sql`EXCLUDED.external_id`,
            title: sql`COALESCE(EXCLUDED.title, ${episode.title})`,
            overview: sql`COALESCE(EXCLUDED.overview, ${episode.overview})`,
            airDate: sql`EXCLUDED.air_date`,
            runtime: sql`EXCLUDED.runtime`,
            stillPath: sql`COALESCE(EXCLUDED.still_path, ${episode.stillPath})`,
            voteAverage: sql`COALESCE(EXCLUDED.vote_average, ${episode.voteAverage})`,
            voteCount: sql`COALESCE(EXCLUDED.vote_count, ${episode.voteCount})`,
            absoluteNumber: sql`EXCLUDED.absolute_number`,
            finaleType: sql`EXCLUDED.finale_type`,
            episodeType: sql`EXCLUDED.episode_type`,
            crew: sql`COALESCE(EXCLUDED.crew, ${episode.crew})`,
            guestStars: sql`COALESCE(EXCLUDED.guest_stars, ${episode.guestStars})`,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error("upsertEpisode: insert returned no row");
      return episodeToDomain(row);
    },

    patchEpisode: async (id, patch) => {
      const patchRow = episodeToPatchRow(patch);
      if (Object.keys(patchRow).length === 0) {
        const existing = await db.query.episode.findFirst({
          where: eq(episode.id, id),
        });
        return existing ? episodeToDomain(existing) : null;
      }
      const [row] = await db
        .update(episode)
        .set({ ...patchRow, updatedAt: new Date() })
        .where(eq(episode.id, id))
        .returning();
      return row ? episodeToDomain(row) : null;
    },

    bulkCreateEpisodesIgnoringConflicts: async (rows) => {
      if (rows.length === 0) return;
      await db
        .insert(episode)
        .values(rows.map(episodeToRow))
        .onConflictDoNothing({
          target: [episode.seasonId, episode.number],
        });
    },
  };
}

