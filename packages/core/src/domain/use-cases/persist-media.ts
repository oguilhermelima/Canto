import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { MediaExtras, NormalizedMedia, NormalizedSeason, MediaType, ProviderName } from "@canto/providers";
import {
  episode,
  episodeTranslation,
  media,
  mediaCredit,
  mediaFile,
  mediaRecommendation,
  mediaTranslation,
  mediaVideo,
  mediaWatchProvider,
  season,
  seasonTranslation,
  supportedLanguage,
  userPlaybackProgress,
  userRating,
  userWatchHistory,
} from "@canto/db/schema";
import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";

import type { MediaProviderPort } from "../ports/media-provider.port";
import { logAndSwallow } from "../../lib/log-error";
import { dispatchMediaPipeline } from "../../infrastructure/queue/bullmq-dispatcher";
import { getEffectiveProviderSync } from "../rules/effective-provider";
import {
  findMediaByExternalId,
  findMediaByAnyReference,
  findMediaByIdWithSeasons,
} from "../../infrastructure/repositories/media-repository";
import {
  dispatchEnsureMedia,
  dispatchTranslateEpisodes,
} from "../../infrastructure/queue/bullmq-dispatcher";
import { detectGaps } from "./detect-gaps";
import { fetchMediaMetadata } from "./fetch-media-metadata";
import { applyMediaTranslation, applySeasonsTranslation } from "../services/translation-service";
import { getActiveUserLanguages, getUserLanguage } from "../services/user-service";
import { loadExtrasFromDB } from "../services/extras-service";
import { normalizedMediaToResponse } from "../mappers/media-mapper";

/** Mirrors the MediaMetadata type from fetch-media-metadata use case. */
export interface MediaMetadata {
  media: NormalizedMedia;
  extras: MediaExtras;
  tvdbSeasons?: NormalizedSeason[];
  tvdbId?: number;
  /** True when TVDB season fetch was attempted but failed (API error, timeout, etc.) */
  tvdbFailed?: boolean;
}

/**
 * Detect gaps in cached data for the user's current language and enqueue a
 * background `ensureMedia` run so the next visit is complete. Fire-and-forget
 * — never blocks the hot path.
 */
async function detectAndEnqueueLazyFill(
  db: Database,
  mediaId: string,
  language: string,
): Promise<void> {
  if (!language || language.startsWith("en")) return;
  const report = await detectGaps(db, mediaId, [language]);
  if (report.gaps.length === 0) return;
  await dispatchEnsureMedia(mediaId, {
    languages: [language],
    aspects: report.gaps,
  });
}

let supportedLanguageCache: Set<string> | null = null;
let supportedLanguageCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getSupportedLanguageCodes(db: Database): Promise<Set<string>> {
  if (supportedLanguageCache && Date.now() - supportedLanguageCacheTime < CACHE_TTL_MS) {
    return supportedLanguageCache;
  }
  const rows = await db.query.supportedLanguage.findMany({
    where: eq(supportedLanguage.enabled, true),
    columns: { code: true },
  });
  supportedLanguageCache = new Set(rows.map((r) => r.code));
  supportedLanguageCacheTime = Date.now();
  return supportedLanguageCache;
}

/**
 * Persist normalized media + seasons + episodes into the database.
 * When `crossRefLookup` is true, checks IMDB/TVDB cross-references to avoid
 * duplicates (used when TVDB toggle is ON). When false, only checks exact match.
 */
export async function persistMedia(
  db: Database,
  normalized: NormalizedMedia,
  opts?: { crossRefLookup?: boolean },
): Promise<typeof media.$inferSelect> {
  const conditions = [
    and(eq(media.externalId, normalized.externalId), eq(media.provider, normalized.provider), eq(media.type, normalized.type)),
  ];

  if (normalized.imdbId) conditions.push(eq(media.imdbId, normalized.imdbId));

  if (opts?.crossRefLookup && normalized.tvdbId) {
    conditions.push(eq(media.tvdbId, normalized.tvdbId));
  }

  const existing = await db.query.media.findFirst({
    where: or(...conditions),
  });

  if (existing) {
    if (existing.provider !== normalized.provider) {
      if (normalized.imdbId && !existing.imdbId) {
        await db.update(media).set({ imdbId: normalized.imdbId }).where(eq(media.id, existing.id));
      }
      return existing;
    }
    return updateMediaFromNormalized(db, existing.id, normalized);
  }

  const [inserted] = await db
    .insert(media)
    .values({
      type: normalized.type,
      externalId: normalized.externalId,
      provider: normalized.provider,
      title: normalized.title,
      originalTitle: normalized.originalTitle,
      overview: normalized.overview,
      tagline: normalized.tagline,
      releaseDate: normalized.releaseDate || null,
      year: normalized.year,
      lastAirDate: normalized.lastAirDate || null,
      status: normalized.status,
      genres: normalized.genres,
      genreIds: normalized.genreIds ?? [],
      contentRating: normalized.contentRating,
      originalLanguage: normalized.originalLanguage,
      spokenLanguages: normalized.spokenLanguages,
      originCountry: normalized.originCountry,
      voteAverage: normalized.voteAverage,
      voteCount: normalized.voteCount,
      popularity: normalized.popularity,
      runtime: normalized.runtime,
      posterPath: normalized.posterPath,
      backdropPath: normalized.backdropPath,
      logoPath: normalized.logoPath,
      imdbId: normalized.imdbId,
      tvdbId: normalized.tvdbId,
      numberOfSeasons: normalized.numberOfSeasons,
      numberOfEpisodes: normalized.numberOfEpisodes,
      inProduction: normalized.inProduction,
      nextAirDate: normalized.nextAirDate || null,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    const conflict = await db.query.media.findFirst({
      where: and(
        eq(media.externalId, normalized.externalId),
        eq(media.provider, normalized.provider),
        eq(media.type, normalized.type),
      ),
    });
    if (conflict) return updateMediaFromNormalized(db, conflict.id, normalized);
    throw new Error("Failed to insert media — conflict without existing row");
  }

  await persistSeasons(db, inserted.id, normalized);
  await persistTranslations(db, inserted.id, normalized);
  return inserted;
}

/** Update an existing media record with fresh normalized data.
 *  Pure update — writes exactly what it receives. Callers that switch providers
 *  are responsible for merging/preserving fields before calling this function.
 */
export async function updateMediaFromNormalized(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
  // TVDB seasons can have seasonType "official" or "default" depending on the show.
  // When present, preserve numberOfSeasons/numberOfEpisodes (managed by applyTvdbSeasons).
  const hasTvdbSeasons = normalized.type === "show"
    ? await db.query.season.findFirst({
        where: and(
          eq(season.mediaId, mediaId),
          inArray(season.seasonType, ["official", "default"]),
        ),
        columns: { id: true },
      })
    : null;

  const [updated] = await db
    .update(media)
    .set({
      externalId: normalized.externalId,
      provider: normalized.provider,
      title: normalized.title,
      originalTitle: normalized.originalTitle,
      overview: normalized.overview,
      tagline: normalized.tagline,
      releaseDate: normalized.releaseDate || null,
      year: normalized.year,
      lastAirDate: normalized.lastAirDate || null,
      status: normalized.status,
      genres: normalized.genres,
      genreIds: normalized.genreIds ?? [],
      contentRating: normalized.contentRating,
      originalLanguage: normalized.originalLanguage,
      spokenLanguages: normalized.spokenLanguages,
      originCountry: normalized.originCountry,
      voteAverage: normalized.voteAverage,
      voteCount: normalized.voteCount,
      popularity: normalized.popularity,
      runtime: normalized.runtime,
      posterPath: normalized.posterPath,
      backdropPath: normalized.backdropPath,
      logoPath: normalized.logoPath,
      imdbId: normalized.imdbId,
      tvdbId: normalized.tvdbId,
      ...(hasTvdbSeasons ? {} : {
        numberOfSeasons: normalized.numberOfSeasons,
        numberOfEpisodes: normalized.numberOfEpisodes,
      }),
      inProduction: normalized.inProduction,
      nextAirDate: normalized.nextAirDate || null,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .returning();

  if (!updated) throw new Error("Failed to update media");

  // Skip season upsert if TVDB-reconciled to avoid re-adding TMDB's flat structure
  // on top of TVDB's granular arcs.
  if (normalized.type === "show" && normalized.seasons && !hasTvdbSeasons) {
    await upsertSeasons(db, mediaId, normalized);
  }

  await persistTranslations(db, mediaId, normalized);

  return updated;
}

export async function persistSeasons(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  if (normalized.type !== "show" || !normalized.seasons) return;

  for (const s of normalized.seasons) {
    const [insertedSeason] = await db
      .insert(season)
      .values({
        mediaId,
        number: s.number,
        externalId: s.externalId,
        name: s.name,
        overview: s.overview,
        airDate: s.airDate || null,
        posterPath: s.posterPath,
        episodeCount: s.episodeCount,
        seasonType: s.seasonType,
        voteAverage: s.voteAverage,
      })
      .returning();

    if (insertedSeason && s.episodes && s.episodes.length > 0) {
      await db.insert(episode).values(
        s.episodes.map((ep) => ({
          seasonId: insertedSeason.id,
          number: ep.number,
          externalId: ep.externalId,
          title: ep.title,
          overview: ep.overview,
          airDate: ep.airDate || null,
          runtime: ep.runtime,
          stillPath: ep.stillPath,
          voteAverage: ep.voteAverage,
          voteCount: ep.voteCount,
          absoluteNumber: ep.absoluteNumber,
          finaleType: ep.finaleType,
          episodeType: ep.episodeType,
          crew: ep.crew,
          guestStars: ep.guestStars,
        })),
      );
    }
  }
}

/**
 * Idempotent season/episode upsert — updates existing rows, inserts missing ones.
 * Never deletes seasons or episodes. Preserves TVDB reconciled data, episode
 * translations, and any other data that the enrich pipeline previously built.
 */
async function upsertSeasons(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  if (normalized.type !== "show" || !normalized.seasons) return;

  for (const s of normalized.seasons) {
    const [upserted] = await db
      .insert(season)
      .values({
        mediaId,
        number: s.number,
        externalId: s.externalId,
        name: s.name,
        overview: s.overview,
        airDate: s.airDate || null,
        posterPath: s.posterPath,
        episodeCount: s.episodeCount,
        seasonType: s.seasonType,
        voteAverage: s.voteAverage,
      })
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
        },
      })
      .returning();

    if (upserted && s.episodes && s.episodes.length > 0) {
      for (const ep of s.episodes) {
        await db
          .insert(episode)
          .values({
            seasonId: upserted.id,
            number: ep.number,
            externalId: ep.externalId,
            title: ep.title,
            overview: ep.overview,
            airDate: ep.airDate || null,
            runtime: ep.runtime,
            stillPath: ep.stillPath,
            voteAverage: ep.voteAverage,
            voteCount: ep.voteCount,
            absoluteNumber: ep.absoluteNumber,
            finaleType: ep.finaleType,
            episodeType: ep.episodeType,
            crew: ep.crew,
            guestStars: ep.guestStars,
          })
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
            },
          });
      }
    }
  }
}

export async function persistTranslations(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  const supported = await getActiveUserLanguages(db);

  if (normalized.translations && normalized.translations.length > 0) {
    const mTransSeen = new Set<string>();
    const mediaTransRows = normalized.translations
      .filter((t) => !t.language.startsWith("en-") && supported.has(t.language) && (t.title || t.overview))
      .map((t) => ({
        mediaId,
        language: t.language,
        title: t.title ?? null,
        overview: t.overview ?? null,
        tagline: t.tagline ?? null,
        posterPath: t.posterPath ?? null,
        logoPath: t.logoPath ?? null,
      }))
      .filter((r) => {
        const key = `${r.mediaId}-${r.language}`;
        if (mTransSeen.has(key)) return false;
        mTransSeen.add(key);
        return true;
      });

    for (let i = 0; i < mediaTransRows.length; i += 500) {
      await db
        .insert(mediaTranslation)
        .values(mediaTransRows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [mediaTranslation.mediaId, mediaTranslation.language],
          set: {
            title: sql`EXCLUDED.title`,
            overview: sql`EXCLUDED.overview`,
            tagline: sql`EXCLUDED.tagline`,
            posterPath: sql`COALESCE(EXCLUDED.poster_path, ${mediaTranslation.posterPath})`,
            logoPath: sql`COALESCE(EXCLUDED.logo_path, ${mediaTranslation.logoPath})`,
          },
        });
    }
  }

  const needSeasonLookup =
    (normalized.seasonTranslations && normalized.seasonTranslations.length > 0) ||
    (normalized.episodeTranslations && normalized.episodeTranslations.length > 0);

  if (!needSeasonLookup) return;

  const seasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    columns: { id: true, number: true },
  });
  const seasonIdByNumber = new Map(seasons.map((s) => [s.number, s.id]));

  if (normalized.seasonTranslations && normalized.seasonTranslations.length > 0) {
    const sTransSeen = new Set<string>();
    const seasonTransRows = normalized.seasonTranslations
      .filter((t) => {
        if (t.language.startsWith("en-") || !supported.has(t.language)) return false;
        const sid = seasonIdByNumber.get(t.seasonNumber);
        return !!sid && (t.name || t.overview);
      })
      .map((t) => ({
        seasonId: seasonIdByNumber.get(t.seasonNumber)!,
        language: t.language,
        name: t.name ?? null,
        overview: t.overview ?? null,
      }))
      .filter((r) => {
        const key = `${r.seasonId}-${r.language}`;
        if (sTransSeen.has(key)) return false;
        sTransSeen.add(key);
        return true;
      });

    for (let i = 0; i < seasonTransRows.length; i += 500) {
      await db
        .insert(seasonTranslation)
        .values(seasonTransRows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [seasonTranslation.seasonId, seasonTranslation.language],
          set: {
            name: sql`EXCLUDED.name`,
            overview: sql`EXCLUDED.overview`,
          },
        });
    }
  }

  if (normalized.episodeTranslations && normalized.episodeTranslations.length > 0) {
    const seasonIds = [...seasonIdByNumber.values()];
    if (seasonIds.length === 0) return;

    const allEpisodes = await db.query.episode.findMany({
      where: inArray(episode.seasonId, seasonIds),
      columns: { id: true, seasonId: true, number: true },
    });

    const seasonNumById = new Map<string, number>();
    for (const [num, id] of seasonIdByNumber) seasonNumById.set(id, num);

    const episodeLookup = new Map<string, string>();
    for (const ep of allEpisodes) {
      const sNum = seasonNumById.get(ep.seasonId);
      if (sNum !== undefined) episodeLookup.set(`${sNum}-${ep.number}`, ep.id);
    }

    const epTransRowsRaw = normalized.episodeTranslations
      .filter((t) => !t.language.startsWith("en-") && supported.has(t.language))
      .map((t) => {
        const epId = episodeLookup.get(`${t.seasonNumber}-${t.episodeNumber}`);
        if (!epId || (!t.title && !t.overview)) return null;
        return {
          episodeId: epId,
          language: t.language,
          title: t.title ?? null,
          overview: t.overview ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Postgres rejects duplicates within the same batch.
    const epTransSeen = new Set<string>();
    const epTransRows = epTransRowsRaw.filter((r) => {
      const key = `${r.episodeId}-${r.language}`;
      if (epTransSeen.has(key)) return false;
      epTransSeen.add(key);
      return true;
    });

    for (let i = 0; i < epTransRows.length; i += 500) {
      await db
        .insert(episodeTranslation)
        .values(epTransRows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [episodeTranslation.episodeId, episodeTranslation.language],
          set: {
            title: sql`EXCLUDED.title`,
            overview: sql`EXCLUDED.overview`,
          },
        });
    }
  }
}

/**
 * Takes a complete MediaMetadata result and persists everything to DB.
 * Single entry point for all media persistence — metadata, seasons,
 * extras, and recommendation stubs.
 */
export async function persistFullMedia(
  db: Database,
  metadata: MediaMetadata,
  existingMediaId?: string,
): Promise<string> {
  const { media: normalized, extras, tvdbSeasons, tvdbId } = metadata;

  let mediaId: string;
  if (existingMediaId) {
    await updateMediaFromNormalized(db, existingMediaId, normalized);
    mediaId = existingMediaId;
  } else {
    const inserted = await persistMedia(db, normalized, { crossRefLookup: !!tvdbId });
    mediaId = inserted.id;
  }

  if (tvdbSeasons && tvdbSeasons.length > 0) {
    await applyTvdbSeasons(db, mediaId, tvdbSeasons, normalized);
    if (tvdbId) {
      await db
        .update(media)
        .set({ tvdbId, updatedAt: new Date() })
        .where(eq(media.id, mediaId));
    }
  }

  await persistExtras(db, mediaId, extras);

  await db
    .update(media)
    .set({
      processingStatus: "ready",
      metadataUpdatedAt: new Date(),
      extrasUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId));

  return mediaId;
}

/**
 * Persist media extras (credits, videos, watch providers, recommendations).
 * Handles delete + re-insert for simple tables and diff-based updates for
 * recommendation junctions.
 */
export async function persistExtras(
  db: Database,
  mediaId: string,
  extras: MediaExtras,
): Promise<void> {
  // Each similar/recommendation needs a media row to link to via the junction
  // table. Stub rows (no metadataUpdatedAt) trigger a full fetch on visit.

  const allRecItems = [
    ...extras.similar.map((r) => ({ result: r, sourceType: "similar" as const })),
    ...extras.recommendations.map((r) => ({ result: r, sourceType: "recommendation" as const })),
  ];

  const uniqueItems = new Map<string, (typeof allRecItems)[number]>();
  for (const item of allRecItems) {
    const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
    if (!uniqueItems.has(key)) uniqueItems.set(key, item);
  }

  const recMediaIdByKey = new Map<string, string>();

  if (uniqueItems.size > 0) {
    const extIds = [...uniqueItems.values()].map((i) => i.result.externalId);
    const existingRows = await db.query.media.findMany({
      where: and(
        inArray(media.externalId, extIds),
        eq(media.provider, "tmdb"),
      ),
      columns: { id: true, externalId: true },
    });
    const existingByExtId = new Map(existingRows.map((r) => [r.externalId, r.id]));

    for (const item of uniqueItems.values()) {
      const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
      const existingId = existingByExtId.get(item.result.externalId);
      if (existingId) {
        recMediaIdByKey.set(key, existingId);
      } else {
        const [inserted] = await db
          .insert(media)
          .values({
            type: item.result.type,
            externalId: item.result.externalId,
            provider: item.result.provider ?? "tmdb",
            title: item.result.title,
            overview: item.result.overview ?? null,
            posterPath: item.result.posterPath ?? null,
            backdropPath: item.result.backdropPath ?? null,
            logoPath: item.result.logoPath ?? null,
            releaseDate: item.result.releaseDate || null,
            year: item.result.year ?? null,
            voteAverage: item.result.voteAverage ?? null,
            genreIds: item.result.genreIds ?? [],
            downloaded: false,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          recMediaIdByKey.set(key, inserted.id);
          // Stub row from TMDB's recs/similar payload — enqueue full metadata
          // fetch so read paths (filtered on metadataUpdatedAt) can surface it.
          void dispatchMediaPipeline({ mediaId: inserted.id }).catch(
            logAndSwallow("persistExtras dispatchMediaPipeline"),
          );
        } else {
          const existing = await db.query.media.findFirst({
            where: and(
              eq(media.externalId, item.result.externalId),
              eq(media.provider, item.result.provider ?? "tmdb"),
              eq(media.type, item.result.type),
            ),
            columns: { id: true },
          });
          if (existing) recMediaIdByKey.set(key, existing.id);
        }
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    await tx.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    await tx.delete(mediaWatchProvider).where(eq(mediaWatchProvider.mediaId, mediaId));
    await tx.delete(mediaRecommendation).where(eq(mediaRecommendation.sourceMediaId, mediaId));

    if (extras.credits.cast.length > 0) {
      await tx.insert(mediaCredit).values(
        extras.credits.cast.map((c, i) => ({
          mediaId,
          personId: c.id,
          name: c.name,
          character: c.character,
          profilePath: c.profilePath,
          type: "cast" as const,
          order: c.order ?? i,
        })),
      );
    }

    if (extras.credits.crew.length > 0) {
      await tx.insert(mediaCredit).values(
        extras.credits.crew.map((c, i) => ({
          mediaId,
          personId: c.id,
          name: c.name,
          department: c.department,
          job: c.job,
          profilePath: c.profilePath,
          type: "crew" as const,
          order: i,
        })),
      );
    }

    if (extras.videos.length > 0) {
      await tx.insert(mediaVideo).values(
        extras.videos.map((v) => ({
          mediaId,
          externalKey: v.key,
          site: v.site,
          name: v.name,
          type: v.type,
          official: v.official,
          language: v.language ?? null,
        })),
      );
    }

    if (extras.watchProviders) {
      const wpRows: Array<{
        mediaId: string;
        providerId: number;
        providerName: string;
        logoPath: string | undefined;
        type: string;
        region: string;
      }> = [];

      for (const [region, data] of Object.entries(extras.watchProviders)) {
        for (const wp of data.flatrate ?? []) {
          wpRows.push({ mediaId, providerId: wp.providerId, providerName: wp.providerName, logoPath: wp.logoPath, type: "stream", region });
        }
        for (const wp of data.rent ?? []) {
          wpRows.push({ mediaId, providerId: wp.providerId, providerName: wp.providerName, logoPath: wp.logoPath, type: "rent", region });
        }
        for (const wp of data.buy ?? []) {
          wpRows.push({ mediaId, providerId: wp.providerId, providerName: wp.providerName, logoPath: wp.logoPath, type: "buy", region });
        }
      }

      if (wpRows.length > 0) {
        await tx.insert(mediaWatchProvider).values(wpRows);
      }
    }

    for (const item of uniqueItems.values()) {
      const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
      const recMediaId = recMediaIdByKey.get(key);
      if (!recMediaId) continue;

      await tx
        .insert(mediaRecommendation)
        .values({
          mediaId: recMediaId,
          sourceMediaId: mediaId,
          sourceType: item.sourceType,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(media)
      .set({ extrasUpdatedAt: new Date() })
      .where(eq(media.id, mediaId));
  });
}

interface TmdbEpisodeData {
  stillPath?: string;
  voteAverage?: number;
  voteCount?: number;
  episodeType?: string;
  crew?: Array<{ name: string; job: string; department?: string; profilePath?: string }>;
  guestStars?: Array<{ name: string; character?: string; profilePath?: string }>;
}

/**
 * Build a flat map of absoluteNumber → TMDB episode data.
 * TMDB seasons are iterated in order (excluding specials/S0), and each
 * episode gets a running absolute index starting at 1.
 */
export function buildTmdbEpisodeMap(
  tmdbSeasons: NormalizedSeason[],
): Map<number, TmdbEpisodeData> {
  const map = new Map<number, TmdbEpisodeData>();
  let absCounter = 0;
  for (const s of tmdbSeasons
    .filter((s) => s.number > 0)
    .sort((a, b) => a.number - b.number)) {
    for (const ep of (s.episodes ?? []).sort((a, b) => a.number - b.number)) {
      absCounter++;
      map.set(absCounter, {
        stillPath: ep.stillPath,
        voteAverage: ep.voteAverage,
        voteCount: ep.voteCount,
        episodeType: ep.episodeType,
        crew: ep.crew,
        guestStars: ep.guestStars,
      });
    }
  }
  return map;
}


/**
 * Overlay TMDB data onto TVDB episodes by matching absoluteNumber.
 * Updates: stillPath, voteAverage, voteCount, episodeType, crew, guestStars.
 * Titles and descriptions stay from TVDB.
 */
export async function overlayTmdbEpisodeData(
  db: Database,
  mediaId: string,
  tmdbEpMap: Map<number, TmdbEpisodeData>,
): Promise<void> {
  if (tmdbEpMap.size === 0) return;

  const seasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, absoluteNumber: true },
      },
    },
  });

  const updates: Array<{ id: string; data: TmdbEpisodeData }> = [];
  for (const s of seasons) {
    for (const ep of s.episodes) {
      if (ep.absoluteNumber == null) continue;
      const tmdb = tmdbEpMap.get(ep.absoluteNumber);
      if (tmdb) updates.push({ id: ep.id, data: tmdb });
    }
  }

  if (updates.length === 0) return;

  // crew/guestStars are JSONB — can't use CASE easily.
  for (const u of updates) {
    await db
      .update(episode)
      .set({
        ...(u.data.stillPath ? { stillPath: u.data.stillPath } : {}),
        ...(u.data.voteAverage != null ? { voteAverage: u.data.voteAverage } : {}),
        ...(u.data.voteCount != null ? { voteCount: u.data.voteCount } : {}),
        ...(u.data.episodeType ? { episodeType: u.data.episodeType } : {}),
        ...(u.data.crew ? { crew: u.data.crew } : {}),
        ...(u.data.guestStars ? { guestStars: u.data.guestStars } : {}),
      })
      .where(eq(episode.id, u.id));
  }
}

/**
 * Overlay TMDB voteAverage onto TVDB seasons.
 * Uses season number matching (TMDB S1 voteAverage → TVDB seasons).
 * For anime with split seasons (TVDB S1-S17 vs TMDB S1-S2), only
 * TMDB S1 and S2 can match by number. Others keep null.
 */
export async function overlayTmdbSeasonData(
  db: Database,
  mediaId: string,
  tmdbSeasons: NormalizedSeason[],
): Promise<void> {
  const tmdbSeasonByNumber = new Map(
    tmdbSeasons.filter((s) => s.number > 0).map((s) => [s.number, s]),
  );
  if (tmdbSeasonByNumber.size === 0) return;

  const dbSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    columns: { id: true, number: true },
  });

  for (const s of dbSeasons) {
    const tmdb = tmdbSeasonByNumber.get(s.number);
    if (tmdb?.voteAverage != null) {
      await db
        .update(season)
        .set({ voteAverage: tmdb.voteAverage })
        .where(eq(season.id, s.id));
    }
  }
}

/**
 * Apply TVDB season/episode structure to a media item.
 *
 * Strategy: detach → save translations → delete → insert → re-attach → restore.
 *
 * Tables with episodeId/seasonId FK (onDelete: cascade) are detached BEFORE
 * the season delete so rows survive. After new seasons are inserted, FKs are
 * re-attached using absoluteNumber (preferred) or seasonNumber+episodeNumber.
 *
 * Translations (episode_translation, season_translation) don't have a nullable
 * FK — they're saved in memory and re-inserted after the rebuild.
 */
export async function applyTvdbSeasons(
  db: Database,
  mediaId: string,
  tvdbSeasons: NormalizedSeason[],
  normalized: NormalizedMedia,
): Promise<void> {
  const existingSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, number: true, absoluteNumber: true },
      },
    },
  });

  const epIdentity = new Map<string, { absoluteNumber: number | null; seasonNumber: number; episodeNumber: number }>();
  for (const s of existingSeasons) {
    for (const e of s.episodes) {
      epIdentity.set(e.id, {
        absoluteNumber: e.absoluteNumber,
        seasonNumber: s.number,
        episodeNumber: e.number,
      });
    }
  }
  const existingEpIds = [...epIdentity.keys()];
  const existingSeasonIds = existingSeasons.map((s) => s.id);

  interface SavedEpTranslation {
    absoluteNumber: number | null;
    seasonNumber: number;
    episodeNumber: number;
    language: string;
    title: string | null;
    overview: string | null;
  }
  let savedEpTranslations: SavedEpTranslation[] = [];

  if (existingEpIds.length > 0) {
    const epTrans = await db.query.episodeTranslation.findMany({
      where: sql`${episodeTranslation.episodeId} IN (${sql.join(
        existingEpIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    });
    savedEpTranslations = epTrans.map((t) => {
      const info = epIdentity.get(t.episodeId);
      return {
        absoluteNumber: info?.absoluteNumber ?? null,
        seasonNumber: info?.seasonNumber ?? 0,
        episodeNumber: info?.episodeNumber ?? 0,
        language: t.language,
        title: t.title,
        overview: t.overview,
      };
    });
  }

  interface SavedSeasonTranslation {
    seasonNumber: number;
    language: string;
    name: string | null;
    overview: string | null;
  }
  let savedSeasonTranslations: SavedSeasonTranslation[] = [];

  if (existingSeasonIds.length > 0) {
    const sTrans = await db.query.seasonTranslation.findMany({
      where: sql`${seasonTranslation.seasonId} IN (${sql.join(
        existingSeasonIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    });
    const seasonNumberById = new Map(existingSeasons.map((s) => [s.id, s.number]));
    savedSeasonTranslations = sTrans.map((t) => ({
      seasonNumber: seasonNumberById.get(t.seasonId) ?? 0,
      language: t.language,
      name: t.name,
      overview: t.overview,
    }));
  }

  interface DetachedRow { rowId: string; oldEpisodeId: string }
  const detachedFiles: DetachedRow[] = [];
  const detachedPlayback: DetachedRow[] = [];
  const detachedHistory: DetachedRow[] = [];
  const detachedRatings: Array<DetachedRow & { oldSeasonId: string | null }> = [];

  if (existingEpIds.length > 0) {
    const epIdIn = sql`IN (${sql.join(existingEpIds.map((id) => sql`${id}`), sql`, `)})`;

    const fileRows = await db.query.mediaFile.findMany({
      where: sql`${mediaFile.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true },
    });
    for (const r of fileRows) if (r.episodeId) detachedFiles.push({ rowId: r.id, oldEpisodeId: r.episodeId });
    if (detachedFiles.length > 0) await db.update(mediaFile).set({ episodeId: null }).where(sql`${mediaFile.episodeId} ${epIdIn}`);

    const playbackRows = await db.query.userPlaybackProgress.findMany({
      where: sql`${userPlaybackProgress.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true },
    });
    for (const r of playbackRows) if (r.episodeId) detachedPlayback.push({ rowId: r.id, oldEpisodeId: r.episodeId });
    if (detachedPlayback.length > 0) await db.update(userPlaybackProgress).set({ episodeId: null }).where(sql`${userPlaybackProgress.episodeId} ${epIdIn}`);

    const historyRows = await db.query.userWatchHistory.findMany({
      where: sql`${userWatchHistory.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true },
    });
    for (const r of historyRows) if (r.episodeId) detachedHistory.push({ rowId: r.id, oldEpisodeId: r.episodeId });
    if (detachedHistory.length > 0) await db.update(userWatchHistory).set({ episodeId: null }).where(sql`${userWatchHistory.episodeId} ${epIdIn}`);

    const ratingRows = await db.query.userRating.findMany({
      where: sql`${userRating.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true, seasonId: true },
    });
    for (const r of ratingRows) if (r.episodeId) detachedRatings.push({ rowId: r.id, oldEpisodeId: r.episodeId, oldSeasonId: r.seasonId });
    if (detachedRatings.length > 0) await db.update(userRating).set({ episodeId: null, seasonId: null }).where(sql`${userRating.episodeId} ${epIdIn}`);
  }

  if (existingSeasonIds.length > 0) {
    const seasonIdIn = sql`IN (${sql.join(existingSeasonIds.map((id) => sql`${id}`), sql`, `)})`;
    const seasonRatings = await db.query.userRating.findMany({
      where: and(sql`${userRating.seasonId} ${seasonIdIn}`, sql`${userRating.episodeId} IS NULL`),
      columns: { id: true, seasonId: true },
    });
    for (const r of seasonRatings) if (r.seasonId) detachedRatings.push({ rowId: r.id, oldEpisodeId: "", oldSeasonId: r.seasonId });
    if (seasonRatings.length > 0) await db.update(userRating).set({ seasonId: null }).where(sql`${userRating.seasonId} ${seasonIdIn}`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(season).where(eq(season.mediaId, mediaId));
    await persistSeasons(tx as unknown as Database, mediaId, {
      ...normalized,
      type: "show",
      seasons: tvdbSeasons,
    });
  });

  const tvdbSeasonCount = tvdbSeasons.filter((s) => s.number > 0).length;
  const tvdbEpisodeCount = tvdbSeasons.reduce(
    (sum, s) => sum + (s.episodes?.length ?? 0),
    0,
  );
  await db
    .update(media)
    .set({ numberOfSeasons: tvdbSeasonCount, numberOfEpisodes: tvdbEpisodeCount, updatedAt: new Date() })
    .where(eq(media.id, mediaId));

  const newSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: { columns: { id: true, number: true, absoluteNumber: true } },
    },
  });

  const newEpByAbsolute = new Map<number, string>();
  const newEpBySeasonEp = new Map<string, string>();
  const newSeasonIdByNumber = new Map<number, string>();
  for (const s of newSeasons) {
    newSeasonIdByNumber.set(s.number, s.id);
    for (const e of s.episodes) {
      if (e.absoluteNumber != null) newEpByAbsolute.set(e.absoluteNumber, e.id);
      newEpBySeasonEp.set(`${s.number}-${e.number}`, e.id);
    }
  }

  function resolveNewEpId(oldEpId: string): string | undefined {
    const info = epIdentity.get(oldEpId);
    if (!info) return undefined;
    if (info.absoluteNumber != null) {
      const id = newEpByAbsolute.get(info.absoluteNumber);
      if (id) return id;
    }
    return newEpBySeasonEp.get(`${info.seasonNumber}-${info.episodeNumber}`);
  }

  function resolveNewSeasonId(oldSeasonId: string): string | undefined {
    const num = existingSeasons.find((s) => s.id === oldSeasonId)?.number;
    return num != null ? newSeasonIdByNumber.get(num) : undefined;
  }

  for (const r of detachedFiles) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await db.update(mediaFile).set({ episodeId: newEpId }).where(eq(mediaFile.id, r.rowId));
  }
  for (const r of detachedPlayback) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await db.update(userPlaybackProgress).set({ episodeId: newEpId }).where(eq(userPlaybackProgress.id, r.rowId));
  }
  for (const r of detachedHistory) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await db.update(userWatchHistory).set({ episodeId: newEpId }).where(eq(userWatchHistory.id, r.rowId));
  }
  for (const r of detachedRatings) {
    const newEpId = r.oldEpisodeId ? resolveNewEpId(r.oldEpisodeId) : undefined;
    const newSeasonId = r.oldSeasonId ? resolveNewSeasonId(r.oldSeasonId) : undefined;
    if (newEpId || newSeasonId) {
      await db.update(userRating).set({
        ...(newEpId ? { episodeId: newEpId } : {}),
        ...(newSeasonId ? { seasonId: newSeasonId } : {}),
      }).where(eq(userRating.id, r.rowId));
    }
  }

  if (savedSeasonTranslations.length > 0) {
    const seasonTransSeen = new Set<string>();
    const seasonTransRows = savedSeasonTranslations
      .filter((t) => newSeasonIdByNumber.has(t.seasonNumber))
      .map((t) => ({
        seasonId: newSeasonIdByNumber.get(t.seasonNumber)!,
        language: t.language,
        name: t.name,
        overview: t.overview,
      }))
      .filter((r) => {
        const key = `${r.seasonId}-${r.language}`;
        if (seasonTransSeen.has(key)) return false;
        seasonTransSeen.add(key);
        return true;
      });
    for (let i = 0; i < seasonTransRows.length; i += 500) {
      await db
        .insert(seasonTranslation)
        .values(seasonTransRows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [seasonTranslation.seasonId, seasonTranslation.language],
          set: { name: sql`EXCLUDED.name`, overview: sql`EXCLUDED.overview` },
        });
    }
  }

  if (savedEpTranslations.length > 0) {
    const epTransRows: Array<{ episodeId: string; language: string; title: string | null; overview: string | null }> = [];
    const epTransSeen = new Set<string>();
    for (const t of savedEpTranslations) {
      let newEpId: string | undefined;
      if (t.absoluteNumber != null) newEpId = newEpByAbsolute.get(t.absoluteNumber);
      if (!newEpId) newEpId = newEpBySeasonEp.get(`${t.seasonNumber}-${t.episodeNumber}`);
      if (!newEpId) continue;
      const dedupKey = `${newEpId}-${t.language}`;
      if (epTransSeen.has(dedupKey)) continue;
      epTransSeen.add(dedupKey);
      epTransRows.push({ episodeId: newEpId, language: t.language, title: t.title, overview: t.overview });
    }
    for (let i = 0; i < epTransRows.length; i += 500) {
      await db
        .insert(episodeTranslation)
        .values(epTransRows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [episodeTranslation.episodeId, episodeTranslation.language],
          set: { title: sql`EXCLUDED.title`, overview: sql`EXCLUDED.overview` },
        });
    }
  }

  if (normalized.seasons) {
    const tmdbEpMap = buildTmdbEpisodeMap(normalized.seasons);
    await overlayTmdbEpisodeData(db, mediaId, tmdbEpMap);
    await overlayTmdbSeasonData(db, mediaId, normalized.seasons);
  }
}

interface PersistMediaInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
}

type MediaRow = typeof media.$inferSelect;

/**
 * Shared pipeline: decide useTVDBSeasons, fetch normalized metadata, persist,
 * and dispatch TVDB episode-translation jobs for non-English languages.
 */
async function fetchPersistAndDispatch(
  db: Database,
  input: PersistMediaInput,
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
  existing: MediaRow | null | undefined,
  tag: string,
): Promise<{ mediaId: string; result: MediaMetadata }> {
  const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
  const useTVDBSeasons = existing
    ? getEffectiveProviderSync(existing, globalTvdbEnabled) === "tvdb"
    : globalTvdbEnabled;

  const supportedLangs = [...await getActiveUserLanguages(db)];

  const result = await fetchMediaMetadata(
    input.externalId, input.provider, input.type,
    providers,
    { useTVDBSeasons, supportedLanguages: supportedLangs },
  );

  const mediaId = await persistFullMedia(db, result, existing?.id);

  if (result.tvdbId && result.tvdbSeasons?.length) {
    const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
    for (const lang of nonEnLangs) {
      void dispatchTranslateEpisodes(mediaId, result.tvdbId, lang).catch(
        logAndSwallow(`${tag} dispatchTranslateEpisodes`),
      );
    }
  }

  return { mediaId, result };
}

/**
 * Persist a resolved media item to DB (fetch + persist + dispatch translations).
 * Called when the user takes an action (download, add to library) on non-persisted media.
 */
export async function persistMediaUseCase(
  db: Database,
  input: PersistMediaInput,
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
) {
  const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;

  const existing = globalTvdbEnabled
    ? await findMediaByAnyReference(db, input.externalId, input.provider, undefined, undefined, input.type)
    : await findMediaByExternalId(db, input.externalId, input.provider, input.type);

  if (existing?.metadataUpdatedAt) return existing;

  const { mediaId } = await fetchPersistAndDispatch(db, input, providers, existing, "media:persist");
  return findMediaByIdWithSeasons(db, mediaId);
}

/**
 * Resolve media by external ID — returns complete metadata, persisting on
 * first visit so subsequent resolves hit the fast DB path.
 *
 * Fast path (metadata + extras both present): reads from DB, applies
 * translation overlays for the user's language, and attaches cached extras.
 *
 * Slow path: fetches live from providers, persists the full row, dispatches
 * TVDB episode translation jobs for non-English languages, then re-reads the
 * persisted row and returns it translated.
 */
export async function resolveMedia(
  db: Database,
  input: PersistMediaInput,
  userId: string,
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
) {
  const existing = await findMediaByExternalId(db, input.externalId, input.provider, input.type);

  if (existing?.metadataUpdatedAt && existing.extrasUpdatedAt) {
    const lang = await getUserLanguage(db, userId);
    const translated = await applyMediaTranslation(db, existing, lang);
    if (translated.seasons) {
      await applySeasonsTranslation(db, translated.seasons, lang);
    }
    const extras = await loadExtrasFromDB(db, existing.id, lang);

    // Lazy fill: if this user's language has gaps, enqueue an ensureMedia
    // job in the background so the next visit has everything.
    void detectAndEnqueueLazyFill(db, existing.id, lang).catch(() => {});

    return {
      source: "db" as const,
      media: translated,
      extras,
      persisted: true,
      mediaId: existing.id,
      inLibrary: existing.inLibrary,
      downloaded: existing.downloaded,
    };
  }

  const { mediaId, result } = await fetchPersistAndDispatch(db, input, providers, existing, "resolveMedia");
  const persisted = await findMediaByIdWithSeasons(db, mediaId);
  if (persisted) {
    const lang = await getUserLanguage(db, userId);
    const translated = await applyMediaTranslation(db, persisted, lang);
    if (translated.seasons) {
      await applySeasonsTranslation(db, translated.seasons, lang);
    }
    const extras = await loadExtrasFromDB(db, persisted.id, lang);

    return {
      source: "db" as const,
      media: translated,
      extras,
      persisted: true,
      mediaId,
      inLibrary: persisted.inLibrary,
      downloaded: persisted.downloaded,
    };
  }

  // Fallback: return live data if re-read somehow fails
  const lang = await getUserLanguage(db, userId);
  const response = normalizedMediaToResponse(result.media, result.tvdbSeasons);
  if (lang && !lang.startsWith("en") && result.media.translations) {
    const trans = result.media.translations.find((t) => t.language === lang);
    if (trans) {
      if (trans.title) response.title = trans.title;
      if (trans.overview) response.overview = trans.overview;
      if (trans.tagline) response.tagline = trans.tagline;
      if (trans.posterPath) response.posterPath = trans.posterPath;
      if (trans.logoPath) response.logoPath = trans.logoPath;
    }
  }

  return {
    source: "live" as const,
    media: response,
    extras: result.extras,
    persisted: true,
    mediaId,
    inLibrary: false,
    downloaded: false,
  };
}
