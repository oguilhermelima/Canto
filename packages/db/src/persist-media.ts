import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { MediaExtras, NormalizedMedia, NormalizedSeason } from "@canto/providers";

/** Mirrors the MediaMetadata type from fetch-media-metadata use case. */
export interface MediaMetadata {
  media: NormalizedMedia;
  extras: MediaExtras;
  tvdbSeasons?: NormalizedSeason[];
  tvdbId?: number;
  /** True when TVDB season fetch was attempted but failed (API error, timeout, etc.) */
  tvdbFailed?: boolean;
}

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
    and(eq(media.externalId, normalized.externalId), eq(media.provider, normalized.provider), eq(media.type, normalized.type)),
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
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    // Concurrent insert won — re-fetch and update instead
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
 *  This is a pure update — it writes exactly what it receives.
 *  Callers that switch providers (e.g. replace-provider) are responsible
 *  for merging/preserving fields before calling this function.
 */
export async function updateMediaFromNormalized(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
  // Check for TVDB seasons BEFORE the update — when present, preserve
  // numberOfSeasons/numberOfEpisodes (managed by applyTvdbSeasons instead).
  // TVDB seasons can have seasonType "official" or "default" depending on the show.
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

  // Upsert seasons + episodes (idempotent — never deletes existing data)
  // Skip if show has TVDB-reconciled seasons (season_type = 'official') to avoid
  // re-adding TMDB's flat season structure on top of TVDB's granular arcs.
  if (normalized.type === "show" && normalized.seasons && !hasTvdbSeasons) {
    await upsertSeasons(db, mediaId, normalized);
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
 * Single entry point for all media persistence — metadata, seasons,
 * extras, and recommendation stubs.
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
  // ── Similar/Recommendations: upsert media rows BEFORE the transaction ──
  // Each similar/recommendation needs a media row to link to via the junction table.
  // We create stub rows (no metadataUpdatedAt) so resolve fetches full data on visit.

  const allRecItems = [
    ...extras.similar.map((r) => ({ result: r, sourceType: "similar" as const })),
    ...extras.recommendations.map((r) => ({ result: r, sourceType: "recommendation" as const })),
  ];

  // Dedup by externalId
  const uniqueItems = new Map<string, (typeof allRecItems)[number]>();
  for (const item of allRecItems) {
    const key = `${item.result.provider ?? "tmdb"}-${item.result.externalId}`;
    if (!uniqueItems.has(key)) uniqueItems.set(key, item);
  }

  const recMediaIdByKey = new Map<string, string>();

  if (uniqueItems.size > 0) {
    // Look up existing media rows for these external IDs
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
        // Create stub row — no metadataUpdatedAt so resolve fetches full data on visit
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
        } else {
          // Conflict = row already exists, re-fetch it
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

  // ── Transaction: only DB writes, no network I/O ──

  await db.transaction(async (tx) => {
    // Clear existing data for this media
    await tx.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    await tx.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    await tx.delete(mediaWatchProvider).where(eq(mediaWatchProvider.mediaId, mediaId));
    await tx.delete(mediaRecommendation).where(eq(mediaRecommendation.sourceMediaId, mediaId));

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

    // Insert recommendation junction entries
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

    // Update extrasUpdatedAt
    await tx
      .update(media)
      .set({ extrasUpdatedAt: new Date() })
      .where(eq(media.id, mediaId));
  });
}

// ─── TMDB still image enrichment ────────────────────────────────────────────

/**
 * Build a flat map of absoluteNumber → TMDB episode stillPath.
 * TMDB seasons are iterated in order (excluding specials/S0), and each
 * episode gets a running absolute index starting at 1.
 */
export function buildTmdbStillMap(
  tmdbSeasons: NormalizedSeason[],
): Map<number, string> {
  const map = new Map<number, string>();
  let absCounter = 0;
  for (const s of tmdbSeasons
    .filter((s) => s.number > 0)
    .sort((a, b) => a.number - b.number)) {
    for (const ep of (s.episodes ?? []).sort((a, b) => a.number - b.number)) {
      absCounter++;
      if (ep.stillPath) map.set(absCounter, ep.stillPath);
    }
  }
  return map;
}

/**
 * Overlay TMDB still images onto TVDB episodes by matching absoluteNumber.
 * Only updates stillPath — titles and descriptions stay from TVDB.
 * Batches updates in chunks to avoid N+1 queries on large shows.
 */
export async function overlayTmdbStills(
  db: Database,
  mediaId: string,
  tmdbStillMap: Map<number, string>,
): Promise<void> {
  if (tmdbStillMap.size === 0) return;

  const seasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, absoluteNumber: true, stillPath: true },
      },
    },
  });

  // Collect all updates needed
  const updates: Array<{ id: string; stillPath: string }> = [];
  for (const s of seasons) {
    for (const ep of s.episodes) {
      if (ep.absoluteNumber == null) continue;
      const tmdbStill = tmdbStillMap.get(ep.absoluteNumber);
      if (tmdbStill && tmdbStill !== ep.stillPath) {
        updates.push({ id: ep.id, stillPath: tmdbStill });
      }
    }
  }

  if (updates.length === 0) return;

  // Batch update using CASE expression (one query per chunk instead of N queries)
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const ids = chunk.map((u) => u.id);
    const caseExpr = sql.join(
      chunk.map((u) => sql`WHEN ${episode.id} = ${u.id} THEN ${u.stillPath}`),
      sql` `,
    );
    await db
      .update(episode)
      .set({ stillPath: sql`CASE ${caseExpr} ELSE ${episode.stillPath} END` })
      .where(inArray(episode.id, ids));
  }
}

// ─── applyTvdbSeasons ───────────────────────────────────────────────────────

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
  // ── 1. Snapshot existing structure ──
  const existingSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, number: true, absoluteNumber: true },
      },
    },
  });

  // Build mapping: old episodeId → identity info for re-attachment
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

  // ── 2. Save translations (cascade-deleted, must be saved in memory) ──
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

  // ── 3. Detach nullable FKs + save {rowId, oldEpisodeId} for re-attachment ──
  interface DetachedRow { rowId: string; oldEpisodeId: string }
  const detachedFiles: DetachedRow[] = [];
  const detachedPlayback: DetachedRow[] = [];
  const detachedHistory: DetachedRow[] = [];
  const detachedRatings: Array<DetachedRow & { oldSeasonId: string | null }> = [];

  if (existingEpIds.length > 0) {
    const epIdIn = sql`IN (${sql.join(existingEpIds.map((id) => sql`${id}`), sql`, `)})`;

    // Save row→episode mapping THEN null out episodeId
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

  // Detach season-level ratings too (seasonId cascades)
  if (existingSeasonIds.length > 0) {
    const seasonIdIn = sql`IN (${sql.join(existingSeasonIds.map((id) => sql`${id}`), sql`, `)})`;
    const seasonRatings = await db.query.userRating.findMany({
      where: and(sql`${userRating.seasonId} ${seasonIdIn}`, sql`${userRating.episodeId} IS NULL`),
      columns: { id: true, seasonId: true },
    });
    for (const r of seasonRatings) if (r.seasonId) detachedRatings.push({ rowId: r.id, oldEpisodeId: "", oldSeasonId: r.seasonId });
    if (seasonRatings.length > 0) await db.update(userRating).set({ seasonId: null }).where(sql`${userRating.seasonId} ${seasonIdIn}`);
  }

  // ── 4. Delete seasons + insert new TVDB structure (transaction) ──
  await db.transaction(async (tx) => {
    await tx.delete(season).where(eq(season.mediaId, mediaId));
    await persistSeasons(tx as unknown as Database, mediaId, {
      ...normalized,
      type: "show",
      seasons: tvdbSeasons,
    });
  });

  // ── 5. Update season/episode counts ──
  const tvdbSeasonCount = tvdbSeasons.filter((s) => s.number > 0).length;
  const tvdbEpisodeCount = tvdbSeasons.reduce(
    (sum, s) => sum + (s.episodes?.length ?? 0),
    0,
  );
  await db
    .update(media)
    .set({ numberOfSeasons: tvdbSeasonCount, numberOfEpisodes: tvdbEpisodeCount, updatedAt: new Date() })
    .where(eq(media.id, mediaId));

  // ── 6. Build new episode lookup for re-attachment ──
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

  /** Resolve old episodeId to new episodeId via identity mapping */
  function resolveNewEpId(oldEpId: string): string | undefined {
    const info = epIdentity.get(oldEpId);
    if (!info) return undefined;
    if (info.absoluteNumber != null) {
      const id = newEpByAbsolute.get(info.absoluteNumber);
      if (id) return id;
    }
    return newEpBySeasonEp.get(`${info.seasonNumber}-${info.episodeNumber}`);
  }

  /** Resolve old seasonId to new seasonId via season number */
  function resolveNewSeasonId(oldSeasonId: string): string | undefined {
    const num = existingSeasons.find((s) => s.id === oldSeasonId)?.number;
    return num != null ? newSeasonIdByNumber.get(num) : undefined;
  }

  // ── 7. Re-attach detached FKs by row ID ──
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

  // ── 8. Restore translations ──
  if (savedSeasonTranslations.length > 0) {
    const seasonTransRows = savedSeasonTranslations
      .filter((t) => newSeasonIdByNumber.has(t.seasonNumber))
      .map((t) => ({
        seasonId: newSeasonIdByNumber.get(t.seasonNumber)!,
        language: t.language,
        name: t.name,
        overview: t.overview,
      }));
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
    for (const t of savedEpTranslations) {
      let newEpId: string | undefined;
      if (t.absoluteNumber != null) newEpId = newEpByAbsolute.get(t.absoluteNumber);
      if (!newEpId) newEpId = newEpBySeasonEp.get(`${t.seasonNumber}-${t.episodeNumber}`);
      if (newEpId) epTransRows.push({ episodeId: newEpId, language: t.language, title: t.title, overview: t.overview });
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

  // ── 9. Overlay TMDB still images ──
  if (normalized.seasons) {
    const tmdbStillMap = buildTmdbStillMap(normalized.seasons);
    await overlayTmdbStills(db, mediaId, tmdbStillMap);
  }
}

