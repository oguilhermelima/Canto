import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { MediaExtras, NormalizedMedia, NormalizedSeason } from "@canto/providers";

/** Mirrors the MediaMetadata type from fetch-media-metadata use case. */
export interface MediaMetadata {
  media: NormalizedMedia;
  extras: MediaExtras;
  tvdbSeasons?: NormalizedSeason[];
  tvdbId?: number;
}

import {
  episode,
  episodeTranslation,
  media,
  mediaCredit,
  mediaTranslation,
  mediaVideo,
  mediaWatchProvider,
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
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .returning();

  if (!updated) throw new Error("Failed to update media");

  // Upsert seasons + episodes (idempotent — never deletes existing data)
  // Skip if show has TVDB-reconciled seasons (season_type = 'official') to avoid
  // re-adding TMDB's flat season structure on top of TVDB's granular arcs.
  if (normalized.type === "show" && normalized.seasons) {
    const hasTvdbSeasons = await db.query.season.findFirst({
      where: and(eq(season.mediaId, mediaId), eq(season.seasonType, "official")),
      columns: { id: true },
    });
    if (!hasTvdbSeasons) {
      await upsertSeasons(db, mediaId, normalized);
    }
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
    // Upsert season by (mediaId, number)
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
            absoluteNumber: ep.absoluteNumber,
            finaleType: ep.finaleType,
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
              voteAverage: sql`EXCLUDED.vote_average`,
              absoluteNumber: sql`EXCLUDED.absolute_number`,
              finaleType: sql`EXCLUDED.finale_type`,
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

// ─── persistFullMedia ───────────────────────────────────────────────────────

/**
 * Takes a complete MediaMetadata result and persists everything to DB.
 * Replaces the scattered persistence across enrich-media, refresh-extras,
 * and reconcile-show-structure.
 */
export async function persistFullMedia(
  db: Database,
  metadata: MediaMetadata,
  existingMediaId?: string,
): Promise<string> {
  const { media: normalized, extras, tvdbSeasons, tvdbId } = metadata;

  // 1. Insert or update media row
  let mediaId: string;
  if (existingMediaId) {
    await updateMediaFromNormalized(db, existingMediaId, normalized);
    mediaId = existingMediaId;
  } else {
    const inserted = await persistMedia(db, normalized, { crossRefLookup: !!tvdbId });
    mediaId = inserted.id;
  }

  // 2. Apply TVDB season structure if present
  if (tvdbSeasons && tvdbSeasons.length > 0) {
    await applyTvdbSeasons(db, mediaId, tvdbSeasons, normalized);
    if (tvdbId) {
      await db
        .update(media)
        .set({ tvdbId, updatedAt: new Date() })
        .where(eq(media.id, mediaId));
    }
  }

  // 3. Persist extras (credits, videos, watch providers, recommendations)
  await persistExtras(db, mediaId, extras);

  // 4. Mark as ready
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

// ─── persistExtras ──────────────────────────────────────────────────────────

/**
 * Persist media extras (credits, videos, watch providers, recommendations).
 * Extracted from refresh-extras.ts — handles delete + re-insert for simple
 * tables and diff-based updates for recommendation junctions.
 */
export async function persistExtras(
  db: Database,
  mediaId: string,
  extras: MediaExtras,
): Promise<void> {
  // ── Transaction: only DB writes, no network I/O ──

  await db.transaction(async (tx) => {
    // Clear existing data for this media
    await tx.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    await tx.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    await tx.delete(mediaWatchProvider).where(eq(mediaWatchProvider.mediaId, mediaId));

    // Insert credits (cast)
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

    // Insert credits (crew)
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

    // Insert videos
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

    // Insert watch providers (flatten all regions)
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

    // Update extrasUpdatedAt
    await tx
      .update(media)
      .set({ extrasUpdatedAt: new Date() })
      .where(eq(media.id, mediaId));
  });
}

// ─── applyTvdbSeasons ───────────────────────────────────────────────────────

/**
 * Apply TVDB season/episode structure to a media item.
 * Saves existing translations, deletes seasons (cascade), persists new TVDB
 * seasons, and restores translations by matching season/episode numbers.
 * Extracted from reconcile-show-structure.ts lines 65-263.
 */
export async function applyTvdbSeasons(
  db: Database,
  mediaId: string,
  tvdbSeasons: NormalizedSeason[],
  normalized: NormalizedMedia,
): Promise<void> {
  // Save existing episode translations before deleting seasons (cascade deletes them)
  const existingSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, number: true, absoluteNumber: true },
      },
    },
  });

  const existingEpIds = existingSeasons.flatMap((s) =>
    s.episodes.map((e) => e.id),
  );

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

    const epInfoById = new Map<
      string,
      { absoluteNumber: number | null; seasonNumber: number; number: number }
    >();
    for (const s of existingSeasons) {
      for (const e of s.episodes) {
        epInfoById.set(e.id, {
          absoluteNumber: e.absoluteNumber,
          seasonNumber: s.number,
          number: e.number,
        });
      }
    }

    savedEpTranslations = epTrans.map((t) => {
      const info = epInfoById.get(t.episodeId);
      return {
        absoluteNumber: info?.absoluteNumber ?? null,
        seasonNumber: info?.seasonNumber ?? 0,
        episodeNumber: info?.number ?? 0,
        language: t.language,
        title: t.title,
        overview: t.overview,
      };
    });
  }

  // Save season translations
  const existingSeasonIds = existingSeasons.map((s) => s.id);
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

    const seasonNumberById = new Map(
      existingSeasons.map((s) => [s.id, s.number]),
    );

    savedSeasonTranslations = sTrans.map((t) => ({
      seasonNumber: seasonNumberById.get(t.seasonId) ?? 0,
      language: t.language,
      name: t.name,
      overview: t.overview,
    }));
  }

  // Delete seasons (cascade deletes episodes + translations)
  await db.delete(season).where(eq(season.mediaId, mediaId));

  // Persist new TVDB seasons — create a synthetic NormalizedMedia for persistSeasons
  await persistSeasons(db, mediaId, {
    ...normalized,
    type: "show",
    seasons: tvdbSeasons,
  });

  // Update season/episode counts
  const tvdbSeasonCount = tvdbSeasons.filter((s) => s.number > 0).length;
  const tvdbEpisodeCount = tvdbSeasons.reduce(
    (sum, s) => sum + (s.episodes?.length ?? 0),
    0,
  );
  await db
    .update(media)
    .set({
      numberOfSeasons: tvdbSeasonCount,
      numberOfEpisodes: tvdbEpisodeCount,
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId));

  // Restore saved translations by matching to new seasons/episodes
  if (savedEpTranslations.length > 0 || savedSeasonTranslations.length > 0) {
    const newSeasons = await db.query.season.findMany({
      where: eq(season.mediaId, mediaId),
      with: {
        episodes: {
          columns: { id: true, number: true, absoluteNumber: true },
        },
      },
    });

    // Restore season translations
    if (savedSeasonTranslations.length > 0) {
      const seasonIdByNumber = new Map(
        newSeasons.map((s) => [s.number, s.id]),
      );
      const seasonTransRows = savedSeasonTranslations
        .filter((t) => seasonIdByNumber.has(t.seasonNumber))
        .map((t) => ({
          seasonId: seasonIdByNumber.get(t.seasonNumber)!,
          language: t.language,
          name: t.name,
          overview: t.overview,
        }));

      for (let i = 0; i < seasonTransRows.length; i += 500) {
        const chunk = seasonTransRows.slice(i, i + 500);
        await db
          .insert(seasonTranslation)
          .values(chunk)
          .onConflictDoUpdate({
            target: [seasonTranslation.seasonId, seasonTranslation.language],
            set: {
              name: sql`EXCLUDED.name`,
              overview: sql`EXCLUDED.overview`,
            },
          });
      }
    }

    // Restore episode translations
    if (savedEpTranslations.length > 0) {
      const newEpByAbsolute = new Map<number, string>();
      const newEpBySeasonEp = new Map<string, string>();
      for (const s of newSeasons) {
        for (const e of s.episodes) {
          if (e.absoluteNumber != null) {
            newEpByAbsolute.set(e.absoluteNumber, e.id);
          }
          newEpBySeasonEp.set(`${s.number}-${e.number}`, e.id);
        }
      }

      const epTransRows: Array<{
        episodeId: string;
        language: string;
        title: string | null;
        overview: string | null;
      }> = [];

      for (const t of savedEpTranslations) {
        let newEpId: string | undefined;
        if (t.absoluteNumber != null) {
          newEpId = newEpByAbsolute.get(t.absoluteNumber);
        }
        if (!newEpId) {
          newEpId = newEpBySeasonEp.get(`${t.seasonNumber}-${t.episodeNumber}`);
        }
        if (newEpId) {
          epTransRows.push({
            episodeId: newEpId,
            language: t.language,
            title: t.title,
            overview: t.overview,
          });
        }
      }

      for (let i = 0; i < epTransRows.length; i += 500) {
        const chunk = epTransRows.slice(i, i + 500);
        await db
          .insert(episodeTranslation)
          .values(chunk)
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
}

