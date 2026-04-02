import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { NormalizedMedia } from "@canto/providers";

import {
  episode,
  episodeTranslation,
  media,
  mediaTranslation,
  season,
  seasonTranslation,
  supportedLanguage,
} from "./schema";
import type { Database } from "./client";

/** Cache of supported language codes to avoid querying on every persist */
let supportedLanguageCache: Set<string> | null = null;
let supportedLanguageCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  // Check for existing record — exact match + IMDB cross-reference always
  const conditions = [
    and(eq(media.externalId, normalized.externalId), eq(media.provider, normalized.provider)),
  ];

  // IMDB cross-reference is always active (universal dedup)
  if (normalized.imdbId) conditions.push(eq(media.imdbId, normalized.imdbId));

  // TVDB cross-reference only when integration is active
  if (opts?.crossRefLookup && normalized.tvdbId) {
    conditions.push(eq(media.tvdbId, normalized.tvdbId));
  }

  const existing = await db.query.media.findFirst({
    where: or(...conditions),
  });

  if (existing) {
    // If found by cross-reference but from a DIFFERENT provider, don't overwrite
    // but do fill in missing cross-reference IDs
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
    .returning();

  if (!inserted) throw new Error("Failed to insert media");

  await persistSeasons(db, inserted.id, normalized);
  await persistTranslations(db, inserted.id, normalized);
  return inserted;
}

/** Update an existing media record with fresh normalized data.
 *  This is a pure update — it writes exactly what it receives.
 *  Callers that switch providers (e.g. replace-provider) are responsible
 *  for merging/preserving fields before calling this function.
 */
export async function updateMediaFromNormalized(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
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
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .returning();

  if (!updated) throw new Error("Failed to update media");

  // Re-create seasons + episodes
  if (normalized.type === "show" && normalized.seasons) {
    await db.delete(season).where(eq(season.mediaId, mediaId));
    await persistSeasons(db, mediaId, normalized);
  }

  // Upsert translations
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
          absoluteNumber: ep.absoluteNumber,
          finaleType: ep.finaleType,
        })),
      );
    }
  }
}

export async function persistTranslations(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  const supported = await getSupportedLanguageCodes(db);

  // ── Media translations (batch upsert) ──
  if (normalized.translations && normalized.translations.length > 0) {
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
      }));

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

  // ── Season + Episode translations need season ID lookup ──
  const needSeasonLookup =
    (normalized.seasonTranslations && normalized.seasonTranslations.length > 0) ||
    (normalized.episodeTranslations && normalized.episodeTranslations.length > 0);

  if (!needSeasonLookup) return;

  const seasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    columns: { id: true, number: true },
  });
  const seasonIdByNumber = new Map(seasons.map((s) => [s.number, s.id]));

  // ── Season translations (batch upsert) ──
  if (normalized.seasonTranslations && normalized.seasonTranslations.length > 0) {
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
      }));

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

  // ── Episode translations (batch upsert) ──
  if (normalized.episodeTranslations && normalized.episodeTranslations.length > 0) {
    const seasonIds = [...seasonIdByNumber.values()];
    if (seasonIds.length === 0) return;

    const allEpisodes = await db.query.episode.findMany({
      where: inArray(episode.seasonId, seasonIds),
      columns: { id: true, seasonId: true, number: true },
    });

    // Build reverse map: seasonId → seasonNumber
    const seasonNumById = new Map<string, number>();
    for (const [num, id] of seasonIdByNumber) seasonNumById.set(id, num);

    // Build lookup: "seasonNum-episodeNum" → episodeId
    const episodeLookup = new Map<string, string>();
    for (const ep of allEpisodes) {
      const sNum = seasonNumById.get(ep.seasonId);
      if (sNum !== undefined) episodeLookup.set(`${sNum}-${ep.number}`, ep.id);
    }

    const epTransRows = normalized.episodeTranslations
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

