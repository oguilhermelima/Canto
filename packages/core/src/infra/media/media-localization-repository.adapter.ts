import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@canto/db/client";
import {
  episode,
  episodeLocalization,
  media,
  mediaLocalization,
  season,
  seasonLocalization,
} from "@canto/db/schema";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type {
  LocaleCode,
  LocalizedEpisode,
  LocalizedSeason,
  MediaLocalization,
} from "@canto/core/domain/media/types/media-localization";
import {
  findMediaLocalized,
  findMediaLocalizedByExternal,
  findMediaLocalizedByExternalMany,
  findMediaLocalizedMany,
} from "@canto/core/infra/media/media-localized-repository";
import { toDomain as localizationToDomain } from "@canto/core/infra/media/media-localization.mapper";

const EN = "en-US";

export function makeMediaLocalizationRepository(
  db: Database,
): MediaLocalizationRepositoryPort {
  return {
    // ─── Reads (raw) ───
    findOne: async (mediaId, language) => {
      const row = await db.query.mediaLocalization.findFirst({
        where: and(
          eq(mediaLocalization.mediaId, mediaId),
          eq(mediaLocalization.language, language),
        ),
      });
      return row ? localizationToDomain(row) : null;
    },

    findAllForMedia: async (mediaId): Promise<MediaLocalization[]> => {
      const rows = await db.query.mediaLocalization.findMany({
        where: eq(mediaLocalization.mediaId, mediaId),
      });
      return rows.map(localizationToDomain);
    },

    // ─── Reads (localized projections) ───
    findLocalizedById: (mediaId, language) =>
      findMediaLocalized(db, mediaId, language),

    findLocalizedByExternal: (externalId, provider, type, language) =>
      findMediaLocalizedByExternal(db, externalId, provider, type, language),

    findLocalizedManyByIds: (mediaIds, language) =>
      findMediaLocalizedMany(db, mediaIds, language),

    findLocalizedManyByExternal: (refs, language) =>
      findMediaLocalizedByExternalMany(db, refs, language),

    // ─── Logo overlay (browse-time) ───
    findLogoOverlayByExternalRefs: async (refs, language) => {
      if (refs.length === 0) return [];
      const isEn = language === EN;
      const conditions = refs.map((r) =>
        and(
          eq(media.externalId, r.externalId),
          eq(media.provider, r.provider),
          eq(media.type, r.type),
        ),
      );

      const flLocEn = alias(mediaLocalization, "fl_loc_en");

      if (isEn) {
        return db
          .select({
            id: media.id,
            externalId: media.externalId,
            type: media.type,
            logoPath: flLocEn.logoPath,
            translatedLogoPath: sql<string | null>`NULL`,
          })
          .from(media)
          .leftJoin(
            flLocEn,
            and(eq(flLocEn.mediaId, media.id), eq(flLocEn.language, EN)),
          )
          .where(or(...conditions));
      }

      const flLocUser = alias(mediaLocalization, "fl_loc_user");
      return db
        .select({
          id: media.id,
          externalId: media.externalId,
          type: media.type,
          logoPath: sql<
            string | null
          >`COALESCE(${flLocUser.logoPath}, ${flLocEn.logoPath})`,
          translatedLogoPath: flLocUser.logoPath,
        })
        .from(media)
        .leftJoin(
          flLocUser,
          and(
            eq(flLocUser.mediaId, media.id),
            eq(flLocUser.language, language),
          ),
        )
        .leftJoin(
          flLocEn,
          and(eq(flLocEn.mediaId, media.id), eq(flLocEn.language, EN)),
        )
        .where(or(...conditions));
    },

    // ─── Reads (season / episode localization) ───
    findLocalizedSeasonsByMedia: (mediaId, language) =>
      readLocalizedSeasons(db, mediaId, language),

    findLocalizedEpisodesBySeason: (seasonId, language) =>
      readLocalizedEpisodes(db, seasonId, language),

    // ─── Writes ───
    upsertMediaLocalization: async (mediaId, language, payload, source) => {
      const now = new Date();
      await db
        .insert(mediaLocalization)
        .values({
          mediaId,
          language,
          title: payload.title,
          overview: payload.overview ?? null,
          tagline: payload.tagline ?? null,
          posterPath: payload.posterPath ?? null,
          logoPath: payload.logoPath ?? null,
          trailerKey: payload.trailerKey ?? null,
          source,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaLocalization.mediaId, mediaLocalization.language],
          set: {
            title: payload.title,
            overview: sql`COALESCE(EXCLUDED.overview, ${mediaLocalization.overview})`,
            tagline: sql`COALESCE(EXCLUDED.tagline, ${mediaLocalization.tagline})`,
            posterPath: sql`COALESCE(EXCLUDED.poster_path, ${mediaLocalization.posterPath})`,
            logoPath: sql`COALESCE(EXCLUDED.logo_path, ${mediaLocalization.logoPath})`,
            trailerKey: sql`COALESCE(EXCLUDED.trailer_key, ${mediaLocalization.trailerKey})`,
            source,
            updatedAt: now,
          },
        });
    },

    upsertSeasonLocalization: async (seasonId, language, payload, source) => {
      const now = new Date();
      await db
        .insert(seasonLocalization)
        .values({
          seasonId,
          language,
          name: payload.name ?? null,
          overview: payload.overview ?? null,
          source,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [seasonLocalization.seasonId, seasonLocalization.language],
          set: {
            name: sql`COALESCE(EXCLUDED.name, ${seasonLocalization.name})`,
            overview: sql`COALESCE(EXCLUDED.overview, ${seasonLocalization.overview})`,
            source,
            updatedAt: now,
          },
        });
    },

    upsertEpisodeLocalization: async (episodeId, language, payload, source) => {
      const now = new Date();
      await db
        .insert(episodeLocalization)
        .values({
          episodeId,
          language,
          title: payload.title ?? null,
          overview: payload.overview ?? null,
          source,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [episodeLocalization.episodeId, episodeLocalization.language],
          set: {
            title: sql`COALESCE(EXCLUDED.title, ${episodeLocalization.title})`,
            overview: sql`COALESCE(EXCLUDED.overview, ${episodeLocalization.overview})`,
            source,
            updatedAt: now,
          },
        });
    },

    // ─── Gap detection ───
    countTranslationsPerLanguage: async (
      mediaId,
      languages,
      includeStructure,
    ) => {
      const result: Record<
        string,
        { media: number; season: number; episode: number }
      > = {};
      for (const lang of languages) {
        result[lang] = { media: 0, season: 0, episode: 0 };
      }
      if (languages.length === 0) return result;

      const langInClause = sql`${mediaLocalization.language} IN (${sql.join(
        languages.map((l) => sql`${l}`),
        sql`, `,
      )})`;

      const mediaLocRows = await db
        .select({ language: mediaLocalization.language })
        .from(mediaLocalization)
        .where(
          and(
            eq(mediaLocalization.mediaId, mediaId),
            langInClause,
            ne(mediaLocalization.language, EN),
          ),
        );
      for (const row of mediaLocRows) {
        const bucket = result[row.language];
        if (bucket) bucket.media = 1;
      }

      if (!includeStructure) return result;

      const seasonLangIn = sql`${seasonLocalization.language} IN (${sql.join(
        languages.map((l) => sql`${l}`),
        sql`, `,
      )})`;
      const seasonLocRows = await db
        .select({
          language: seasonLocalization.language,
          n: sql<number>`count(*)::int`,
        })
        .from(seasonLocalization)
        .innerJoin(season, eq(seasonLocalization.seasonId, season.id))
        .where(
          and(
            eq(season.mediaId, mediaId),
            seasonLangIn,
            ne(seasonLocalization.language, EN),
          ),
        )
        .groupBy(seasonLocalization.language);
      for (const row of seasonLocRows) {
        const bucket = result[row.language];
        if (bucket) bucket.season = row.n;
      }

      const episodeLangIn = sql`${episodeLocalization.language} IN (${sql.join(
        languages.map((l) => sql`${l}`),
        sql`, `,
      )})`;
      const episodeLocRows = await db
        .select({
          language: episodeLocalization.language,
          n: sql<number>`count(*)::int`,
        })
        .from(episodeLocalization)
        .innerJoin(episode, eq(episodeLocalization.episodeId, episode.id))
        .innerJoin(season, eq(episode.seasonId, season.id))
        .where(
          and(
            eq(season.mediaId, mediaId),
            episodeLangIn,
            ne(episodeLocalization.language, EN),
          ),
        )
        .groupBy(episodeLocalization.language);
      for (const row of episodeLocRows) {
        const bucket = result[row.language];
        if (bucket) bucket.episode = row.n;
      }

      return result;
    },

    findLogoLanguagesByMediaId: async (mediaId) => {
      const rows = await db
        .select({ language: mediaLocalization.language })
        .from(mediaLocalization)
        .where(
          and(
            eq(mediaLocalization.mediaId, mediaId),
            isNotNull(mediaLocalization.logoPath),
            ne(mediaLocalization.language, EN),
          ),
        );
      return rows.map((r) => r.language);
    },
  };
}

async function readLocalizedSeasons(
  db: Database,
  mediaId: string,
  language: LocaleCode,
): Promise<LocalizedSeason[]> {
  const isEn = language === EN;
  const locEn = alias(seasonLocalization, "loc_en");

  if (isEn) {
    return db
      .select({
        id: season.id,
        mediaId: season.mediaId,
        number: season.number,
        posterPath: season.posterPath,
        airDate: season.airDate,
        episodeCount: season.episodeCount,
        voteAverage: season.voteAverage,
        name: sql<string | null>`${locEn.name}`,
        overview: sql<string | null>`${locEn.overview}`,
      })
      .from(season)
      .leftJoin(
        locEn,
        and(eq(locEn.seasonId, season.id), eq(locEn.language, EN)),
      )
      .where(eq(season.mediaId, mediaId))
      .orderBy(season.number);
  }

  const locUser = alias(seasonLocalization, "loc_user");
  return db
    .select({
      id: season.id,
      mediaId: season.mediaId,
      number: season.number,
      posterPath: season.posterPath,
      airDate: season.airDate,
      episodeCount: season.episodeCount,
      voteAverage: season.voteAverage,
      name: sql<string | null>`COALESCE(${locUser.name}, ${locEn.name})`,
      overview: sql<string | null>`COALESCE(${locUser.overview}, ${locEn.overview})`,
    })
    .from(season)
    .leftJoin(
      locUser,
      and(eq(locUser.seasonId, season.id), eq(locUser.language, language)),
    )
    .leftJoin(
      locEn,
      and(eq(locEn.seasonId, season.id), eq(locEn.language, EN)),
    )
    .where(eq(season.mediaId, mediaId))
    .orderBy(season.number);
}

async function readLocalizedEpisodes(
  db: Database,
  seasonId: string,
  language: LocaleCode,
): Promise<LocalizedEpisode[]> {
  const isEn = language === EN;
  const locEn = alias(episodeLocalization, "loc_en");

  if (isEn) {
    return db
      .select({
        id: episode.id,
        seasonId: episode.seasonId,
        number: episode.number,
        externalId: episode.externalId,
        airDate: episode.airDate,
        runtime: episode.runtime,
        stillPath: episode.stillPath,
        voteAverage: episode.voteAverage,
        voteCount: episode.voteCount,
        title: sql<string | null>`${locEn.title}`,
        overview: sql<string | null>`${locEn.overview}`,
      })
      .from(episode)
      .leftJoin(
        locEn,
        and(eq(locEn.episodeId, episode.id), eq(locEn.language, EN)),
      )
      .where(eq(episode.seasonId, seasonId))
      .orderBy(episode.number);
  }

  const locUser = alias(episodeLocalization, "loc_user");
  return db
    .select({
      id: episode.id,
      seasonId: episode.seasonId,
      number: episode.number,
      externalId: episode.externalId,
      airDate: episode.airDate,
      runtime: episode.runtime,
      stillPath: episode.stillPath,
      voteAverage: episode.voteAverage,
      voteCount: episode.voteCount,
      title: sql<string | null>`COALESCE(${locUser.title}, ${locEn.title})`,
      overview: sql<string | null>`COALESCE(${locUser.overview}, ${locEn.overview})`,
    })
    .from(episode)
    .leftJoin(
      locUser,
      and(eq(locUser.episodeId, episode.id), eq(locUser.language, language)),
    )
    .leftJoin(
      locEn,
      and(eq(locEn.episodeId, episode.id), eq(locEn.language, EN)),
    )
    .where(eq(episode.seasonId, seasonId))
    .orderBy(episode.number);
}
