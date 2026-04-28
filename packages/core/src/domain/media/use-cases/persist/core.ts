import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { NormalizedMedia, MediaType, ProviderName } from "@canto/providers";
import { episode, media, season } from "@canto/db/schema";
import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";

import type { MediaProviderPort } from "../../../shared/ports/media-provider.port";
import { logAndSwallow } from "../../../../platform/logger/log-error";
import { getEffectiveProviderSync } from "../../../shared/rules/effective-provider";
import {
  findMediaByExternalId,
  findMediaByAnyReference,
  findMediaByIdWithSeasons,
} from "../../../../infra/repositories";
import {
  dispatchEnsureMedia,
  dispatchTranslateEpisodes,
} from "../../../../platform/queue/bullmq-dispatcher";
import { detectGaps } from "../detect-gaps";
import { fetchMediaMetadata, type MediaMetadata } from "../fetch-media-metadata";
import { applyMediaTranslation, applySeasonsTranslation } from "../../../shared/services/translation-service";
import { applyMediaContentRating } from "../../../shared/services/content-rating-service";
import { getActiveUserLanguages, getUserWatchPreferences } from "../../../shared/services/user-service";
import { loadExtrasFromDB } from "../../services/extras-service";
import { normalizedMediaToResponse } from "../../../shared/mappers/media-mapper";

import { persistTranslations } from "./translations";
import { persistContentRatings } from "./content-ratings";
import { persistExtras } from "./extras";
import { applyTvdbSeasons } from "./tvdb-overlay";

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
      airsTime: normalized.airsTime ?? null,
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
  await persistContentRatings(db, inserted.id, normalized);
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
      airsTime: normalized.airsTime ?? null,
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
  await persistContentRatings(db, mediaId, normalized);

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
    const { language: lang, watchRegion } = await getUserWatchPreferences(db, userId);
    const translated = await applyMediaTranslation(db, existing, lang);
    const withRating = await applyMediaContentRating(db, translated, watchRegion);
    if (withRating.seasons) {
      await applySeasonsTranslation(db, withRating.seasons, lang);
    }
    const extras = await loadExtrasFromDB(db, existing.id, lang);

    // Lazy fill: if this user's language has gaps, enqueue an ensureMedia
    // job in the background so the next visit has everything.
    void detectAndEnqueueLazyFill(db, existing.id, lang).catch(() => {});

    return {
      source: "db" as const,
      media: withRating,
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
    const { language: lang, watchRegion } = await getUserWatchPreferences(db, userId);
    const translated = await applyMediaTranslation(db, persisted, lang);
    const withRating = await applyMediaContentRating(db, translated, watchRegion);
    if (withRating.seasons) {
      await applySeasonsTranslation(db, withRating.seasons, lang);
    }
    const extras = await loadExtrasFromDB(db, persisted.id, lang);

    return {
      source: "db" as const,
      media: withRating,
      extras,
      persisted: true,
      mediaId,
      inLibrary: persisted.inLibrary,
      downloaded: persisted.downloaded,
    };
  }

  // Fallback: return live data if re-read somehow fails
  const { language: lang, watchRegion } = await getUserWatchPreferences(db, userId);
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
  if (watchRegion && watchRegion !== "US" && result.media.contentRatings) {
    const rating = result.media.contentRatings.find((c) => c.region === watchRegion);
    if (rating) response.contentRating = rating.rating;
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
