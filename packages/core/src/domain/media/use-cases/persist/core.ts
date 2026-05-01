import type { Database } from "@canto/db/client";
import type { MediaType, NormalizedMedia, ProviderName } from "@canto/providers";
import { getSetting } from "@canto/db/settings";

import type { Media } from "@canto/core/domain/media/types/media";
import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import { loadCadenceKnobs } from "@canto/core/domain/media/use-cases/cadence/cadence-knobs";
import {
  buildMediaContext,
  writeAspectState,
} from "@canto/core/domain/media/use-cases/cadence/aspect-state-writer";
import { detectGaps } from "@canto/core/domain/media/use-cases/detect-gaps";
import {
  fetchMediaMetadata,
} from "@canto/core/domain/media/use-cases/fetch-media-metadata";
import type { MediaMetadata } from "@canto/core/domain/media/use-cases/fetch-media-metadata";
import { persistContentRatings } from "@canto/core/domain/media/use-cases/persist/content-ratings";
import { persistExtras } from "@canto/core/domain/media/use-cases/persist/extras";
import { persistTranslations } from "@canto/core/domain/media/use-cases/persist/translations";
import { applyTvdbSeasons } from "@canto/core/domain/media/use-cases/persist/tvdb-overlay";
import { loadExtrasFromDB } from "@canto/core/domain/media/services/extras-service";
import {
  MediaInsertConflictError,
  MediaPostInsertNotFoundError,
  MediaUpdateFailedError,
} from "@canto/core/domain/media/errors";
import { applyMediaContentRating } from "@canto/core/domain/shared/services/content-rating-service";
import {
  getActiveUserLanguages,
  getUserWatchPreferences,
} from "@canto/core/domain/shared/services/user-service";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";
import { normalizedMediaToResponse } from "@canto/core/domain/shared/mappers/media-mapper";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import {
  applyMediaLocalizationOverlay,
  applySeasonsLocalizationOverlay,
} from "@canto/core/domain/shared/localization/localization-service";
import { getEffectiveProviderSync } from "@canto/core/domain/shared/rules/effective-provider";

/**
 * Repository ports the persist orchestration depends on. Callers (HTTP routers,
 * worker jobs) build them once at the entry edge and pass them down.
 */
export interface PersistDeps {
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
  userPrefs: UserPreferencesPort;
}

/**
 * Detect gaps in cached data for the user's current language and enqueue a
 * background `ensureMedia` run so the next visit is complete. Fire-and-forget
 * — never blocks the hot path.
 */
async function detectAndEnqueueLazyFill(
  db: Database,
  deps: PersistDeps,
  mediaId: string,
  language: string,
): Promise<void> {
  if (!language || language.startsWith("en")) return;
  const report = await detectGaps(db, deps, mediaId, [language]);
  if (report.gaps.length === 0) return;
  await deps.dispatcher.enrichMedia(mediaId, {
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
  deps: PersistDeps,
  opts?: { crossRefLookup?: boolean },
): Promise<Media> {
  const existing = await deps.media.findByAnyReference(
    normalized.externalId,
    normalized.provider,
    normalized.imdbId ?? undefined,
    opts?.crossRefLookup ? (normalized.tvdbId ?? undefined) : undefined,
    normalized.type,
  );

  if (existing) {
    if (existing.provider !== normalized.provider) {
      if (normalized.imdbId && !existing.imdbId) {
        await deps.media.updateMedia(existing.id, {
          imdbId: normalized.imdbId,
        });
      }
      return existing;
    }
    return updateMediaFromNormalized(db, existing.id, normalized, deps);
  }

  const inserted = await deps.media.tryCreateMedia(buildMediaInsert(normalized));

  if (!inserted) {
    const conflict = await deps.media.findByExternalId(
      normalized.externalId,
      normalized.provider,
      normalized.type,
    );
    if (conflict) {
      return updateMediaFromNormalized(db, conflict.id, normalized, deps);
    }
    throw new MediaInsertConflictError();
  }

  await deps.localization.upsertMediaLocalization(
    inserted.id,
    "en-US",
    {
      title: normalized.title,
      overview: normalized.overview,
      tagline: normalized.tagline,
      posterPath: normalized.posterPath,
      logoPath: normalized.logoPath,
    },
    "original",
  );

  await persistSeasons(deps, inserted.id, normalized);
  await persistTranslations(db, inserted.id, normalized, deps);
  await persistContentRatings(inserted.id, normalized, { deps });
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
  deps: PersistDeps,
): Promise<Media> {
  // When TVDB structure is reconciled, preserve numberOfSeasons/numberOfEpisodes
  // (applyTvdbSeasons manages them).
  const hasTvdbSeasons =
    normalized.type === "show"
      ? await deps.media.hasTvdbReconciledStructure(mediaId)
      : false;

  const updated = await deps.media.updateMedia(
    mediaId,
    buildMediaUpdate(normalized, hasTvdbSeasons),
  );

  if (!updated) throw new MediaUpdateFailedError();

  await deps.localization.upsertMediaLocalization(
    mediaId,
    "en-US",
    {
      title: normalized.title,
      overview: normalized.overview,
      tagline: normalized.tagline,
      posterPath: normalized.posterPath,
      logoPath: normalized.logoPath,
    },
    "original",
  );

  // Skip season upsert if TVDB-reconciled to avoid re-adding TMDB's flat structure
  // on top of TVDB's granular arcs.
  if (normalized.type === "show" && normalized.seasons && !hasTvdbSeasons) {
    await upsertSeasons(deps, mediaId, normalized);
  }

  await persistTranslations(db, mediaId, normalized, deps);
  await persistContentRatings(mediaId, normalized, { deps });

  return updated;
}

// TMDB sometimes returns empty strings for absent date fields. Treat those as
// null so the column stays clean.
function emptyToNull(s: string | null | undefined): string | null {
  return s !== null && s !== undefined && s.length > 0 ? s : null;
}

function buildMediaInsert(normalized: NormalizedMedia) {
  return {
    type: normalized.type,
    externalId: normalized.externalId,
    provider: normalized.provider,
    originalTitle: normalized.originalTitle,
    releaseDate: emptyToNull(normalized.releaseDate),
    year: normalized.year,
    lastAirDate: emptyToNull(normalized.lastAirDate),
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
    backdropPath: normalized.backdropPath,
    imdbId: normalized.imdbId,
    tvdbId: normalized.tvdbId,
    numberOfSeasons: normalized.numberOfSeasons,
    numberOfEpisodes: normalized.numberOfEpisodes,
    inProduction: normalized.inProduction,
    nextAirDate: emptyToNull(normalized.nextAirDate),
    airsTime: normalized.airsTime ?? null,
    networks: normalized.networks,
    budget: normalized.budget,
    revenue: normalized.revenue,
    collection: normalized.collection,
    productionCompanies: normalized.productionCompanies,
    productionCountries: normalized.productionCountries,
  };
}

function buildMediaUpdate(
  normalized: NormalizedMedia,
  hasTvdbSeasons: boolean,
) {
  return {
    externalId: normalized.externalId,
    provider: normalized.provider,
    originalTitle: normalized.originalTitle,
    releaseDate: emptyToNull(normalized.releaseDate),
    year: normalized.year,
    lastAirDate: emptyToNull(normalized.lastAirDate),
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
    backdropPath: normalized.backdropPath,
    imdbId: normalized.imdbId,
    tvdbId: normalized.tvdbId,
    ...(hasTvdbSeasons
      ? {}
      : {
          numberOfSeasons: normalized.numberOfSeasons,
          numberOfEpisodes: normalized.numberOfEpisodes,
        }),
    inProduction: normalized.inProduction,
    nextAirDate: emptyToNull(normalized.nextAirDate),
    airsTime: normalized.airsTime ?? null,
    networks: normalized.networks,
    budget: normalized.budget,
    revenue: normalized.revenue,
    collection: normalized.collection,
    productionCompanies: normalized.productionCompanies,
    productionCountries: normalized.productionCountries,
  };
}

export async function persistSeasons(
  deps: Pick<PersistDeps, "media">,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  if (normalized.type !== "show" || !normalized.seasons) return;

  for (const s of normalized.seasons) {
    const insertedSeason = await deps.media.createSeason({
      mediaId,
      number: s.number,
      externalId: s.externalId,
      name: s.name,
      overview: s.overview,
      airDate: emptyToNull(s.airDate),
      posterPath: s.posterPath,
      episodeCount: s.episodeCount,
      seasonType: s.seasonType,
      voteAverage: s.voteAverage,
    });

    if (s.episodes && s.episodes.length > 0) {
      await deps.media.bulkCreateEpisodesIgnoringConflicts(
        s.episodes.map((ep) => ({
          seasonId: insertedSeason.id,
          number: ep.number,
          externalId: ep.externalId,
          title: ep.title,
          overview: ep.overview,
          airDate: emptyToNull(ep.airDate),
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
  deps: PersistDeps,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  if (normalized.type !== "show" || !normalized.seasons) return;

  for (const s of normalized.seasons) {
    const upserted = await deps.media.upsertSeason({
      mediaId,
      number: s.number,
      externalId: s.externalId,
      name: s.name,
      overview: s.overview,
      airDate: emptyToNull(s.airDate),
      posterPath: s.posterPath,
      episodeCount: s.episodeCount,
      seasonType: s.seasonType,
      voteAverage: s.voteAverage,
    });

    if (s.episodes && s.episodes.length > 0) {
      for (const ep of s.episodes) {
        await deps.media.upsertEpisode({
          seasonId: upserted.id,
          number: ep.number,
          externalId: ep.externalId,
          title: ep.title,
          overview: ep.overview,
          airDate: emptyToNull(ep.airDate),
          runtime: ep.runtime,
          stillPath: ep.stillPath,
          voteAverage: ep.voteAverage,
          voteCount: ep.voteCount,
          absoluteNumber: ep.absoluteNumber,
          finaleType: ep.finaleType,
          episodeType: ep.episodeType,
          crew: ep.crew,
          guestStars: ep.guestStars,
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
  deps: PersistDeps,
  existingMediaId?: string,
): Promise<string> {
  const { media: normalized, extras, tvdbSeasons, tvdbId } = metadata;

  let mediaId: string;
  if (existingMediaId) {
    await updateMediaFromNormalized(db, existingMediaId, normalized, deps);
    mediaId = existingMediaId;
  } else {
    const inserted = await persistMedia(db, normalized, deps, {
      crossRefLookup: !!tvdbId,
    });
    mediaId = inserted.id;
  }

  if (tvdbSeasons && tvdbSeasons.length > 0) {
    await applyTvdbSeasons(db, mediaId, tvdbSeasons, normalized, {
      media: deps.media,
      localization: deps.localization,
    });
    if (tvdbId) {
      await deps.media.updateMedia(mediaId, { tvdbId });
    }
  }

  await persistExtras(db, mediaId, extras, deps);

  await deps.media.updateMedia(mediaId, { processingStatus: "ready" });

  await seedMetadataAndExtrasAspects(db, mediaId, normalized, deps);

  return mediaId;
}

/**
 * Mark `metadata` and `extras` aspects as successfully fetched so subsequent
 * fast-path reads don't re-fetch. `next_eligible_at` is computed by the
 * standard `writeAspectState` helper from the inserted media row's
 * release/airing context.
 */
async function seedMetadataAndExtrasAspects(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
  deps: PersistDeps,
): Promise<void> {
  const knobs = await loadCadenceKnobs(db);
  const ctx = buildMediaContext({
    type: normalized.type,
    provider: normalized.provider,
    overrideProviderFor: null,
    releaseDate: normalized.releaseDate ?? null,
    nextAirDate: normalized.nextAirDate ?? null,
  });
  const now = new Date();
  const provider = normalized.provider;
  const stateByKey = new Map();
  await writeAspectState({
    aspectState: deps.aspectState,
    mediaId,
    aspect: "metadata",
    scope: "",
    outcome: "data",
    ctx,
    knobs,
    stateByKey,
    now,
    provider,
  });
  await writeAspectState({
    aspectState: deps.aspectState,
    mediaId,
    aspect: "extras",
    scope: "",
    outcome: "data",
    ctx,
    knobs,
    stateByKey,
    now,
    provider,
  });
}

interface PersistMediaInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
}

/**
 * Shared pipeline: decide useTVDBSeasons, fetch normalized metadata, persist,
 * and dispatch TVDB episode-translation jobs for non-English languages.
 */
async function fetchPersistAndDispatch(
  db: Database,
  input: PersistMediaInput,
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
  existing: Media | null,
  tag: string,
  deps: PersistDeps,
): Promise<{ mediaId: string; result: MediaMetadata }> {
  const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
  const useTVDBSeasons = existing
    ? getEffectiveProviderSync(existing, globalTvdbEnabled) === "tvdb"
    : globalTvdbEnabled;

  const supportedLangs = [...(await getActiveUserLanguages(deps))];

  const result = await fetchMediaMetadata(
    input.externalId,
    input.provider,
    input.type,
    { ...providers, logger: deps.logger },
    { useTVDBSeasons, supportedLanguages: supportedLangs },
  );

  const mediaId = await persistFullMedia(db, result, deps, existing?.id);

  if (result.tvdbId && result.tvdbSeasons?.length) {
    const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
    for (const lang of nonEnLangs) {
      void deps.dispatcher
        .enrichMedia(mediaId, {
          aspects: ["translations"],
          languages: [lang],
        })
        .catch(deps.logger.logAndSwallow(`${tag} dispatchEnsureMedia(translations)`));
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
  deps: PersistDeps,
) {
  const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;

  const existing = globalTvdbEnabled
    ? await deps.media.findByAnyReference(
        input.externalId,
        input.provider,
        undefined,
        undefined,
        input.type,
      )
    : await deps.media.findByExternalId(
        input.externalId,
        input.provider,
        input.type,
      );

  if (existing) {
    const metadataSucceededAt = await deps.aspectState.findSucceededAt(
      existing.id,
      "metadata",
    );
    if (metadataSucceededAt) return existing;
  }

  const { mediaId } = await fetchPersistAndDispatch(
    db,
    input,
    providers,
    existing,
    "media:persist",
    deps,
  );
  return deps.media.findByIdWithSeasons(mediaId);
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
  deps: PersistDeps,
) {
  const existing = await deps.media.findByExternalId(
    input.externalId,
    input.provider,
    input.type,
  );

  const [metadataSucceededAt, extrasSucceededAt] = existing
    ? await Promise.all([
        deps.aspectState.findSucceededAt(existing.id, "metadata"),
        deps.aspectState.findSucceededAt(existing.id, "extras"),
      ])
    : [null, null];

  if (existing && metadataSucceededAt && extrasSucceededAt) {
    const { language: lang, watchRegion } = await getUserWatchPreferences(
      deps,
      userId,
    );
    const localized = await applyMediaLocalizationOverlay(existing, lang, {
      localization: deps.localization,
    });
    const withRating = await applyMediaContentRating(deps, localized, watchRegion);
    const finalMedia =
      withRating.seasons.length > 0
        ? {
            ...withRating,
            seasons: await applySeasonsLocalizationOverlay(
              existing.id,
              withRating.seasons,
              lang,
              { localization: deps.localization },
            ),
          }
        : withRating;
    const extras = await loadExtrasFromDB(existing.id, lang, {
      extras: deps.extras,
      localization: deps.localization,
    });

    // Lazy fill: if this user's language has gaps, enqueue an ensureMedia
    // job in the background so the next visit has everything.
    void detectAndEnqueueLazyFill(db, deps, existing.id, lang).catch(() => {});

    return {
      source: "db" as const,
      media: finalMedia,
      extras,
      persisted: true,
      mediaId: existing.id,
      inLibrary: existing.inLibrary,
      downloaded: existing.downloaded,
    };
  }

  const { mediaId, result } = await fetchPersistAndDispatch(
    db,
    input,
    providers,
    existing,
    "resolveMedia",
    deps,
  );
  const persisted = await deps.media.findByIdWithSeasons(mediaId);
  if (persisted) {
    const { language: lang, watchRegion } = await getUserWatchPreferences(
      deps,
      userId,
    );
    const localized = await applyMediaLocalizationOverlay(persisted, lang, {
      localization: deps.localization,
    });
    const withRating = await applyMediaContentRating(deps, localized, watchRegion);
    const finalMedia =
      withRating.seasons.length > 0
        ? {
            ...withRating,
            seasons: await applySeasonsLocalizationOverlay(
              persisted.id,
              withRating.seasons,
              lang,
              { localization: deps.localization },
            ),
          }
        : withRating;
    const extras = await loadExtrasFromDB(persisted.id, lang, {
      extras: deps.extras,
      localization: deps.localization,
    });

    return {
      source: "db" as const,
      media: finalMedia,
      extras,
      persisted: true,
      mediaId,
      inLibrary: persisted.inLibrary,
      downloaded: persisted.downloaded,
    };
  }

  // Fallback: the row genuinely vanished between persist and re-read. Use
  // the live response with the user-language overlay applied client-side
  // so the caller still gets a coherent result instead of a hard error.
  const { language: lang, watchRegion } = await getUserWatchPreferences(
    deps,
    userId,
  );
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
    const rating = result.media.contentRatings.find(
      (c) => c.region === watchRegion,
    );
    if (rating) response.contentRating = rating.rating;
  }

  if (!mediaId) throw new MediaPostInsertNotFoundError();

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
