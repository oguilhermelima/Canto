import type { Database } from "@canto/db/client";
import {
  persistTranslations,
  applyTvdbSeasons,
  buildTmdbEpisodeMap,
  overlayTmdbEpisodeData,
  overlayTmdbSeasonData,
} from "./persist";
import { getActiveUserLanguages } from "../../shared/services/user-service";
import {
  findMediaById,
  updateMedia,
} from "../../../infra/repositories";
import { findMediaLocalized } from "../../../infra/media/media-localized-repository";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import { logAndSwallow } from "../../../platform/logger/log-error";
import type { JobDispatcherPort } from "../../shared/ports/job-dispatcher.port";
import { getEffectiveProvider } from "../../shared/rules/effective-provider";
import { upsertMediaLocalization } from "../../shared/localization";

/**
 * Reconcile season/episode structure from TVDB without touching TMDB metadata.
 * Saves structure in English (fast), then dispatches per-language translation jobs.
 */
export async function reconcileShowStructure(
  db: Database,
  mediaId: string,
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort; dispatcher?: JobDispatcherPort },
  options?: { force?: boolean; dispatchTranslations?: boolean },
): Promise<void> {
  const row = await findMediaById(db, mediaId);
  if (!row || row.type !== "show") return;

  if (!options?.force) {
    const effectiveProvider = await getEffectiveProvider(row);
    if (effectiveProvider !== "tvdb") return;
  }

  const isAlreadyTvdb = row.provider === "tvdb";
  const tvdb = deps.tvdb;

  // Title for log messages + TVDB title-search fallback comes from en-US
  // localization (the only post-1C-δ home for the canonical English title).
  const enLoc = await findMediaLocalized(db, row.id, "en-US");
  const enTitle = enLoc?.title ?? "";

  // Resolve TVDB ID
  let tvdbId = isAlreadyTvdb ? row.externalId : row.tvdbId;
  if (!tvdbId) {
    if (enTitle) {
      try {
        const results = await tvdb.search(enTitle, "show");
        if (results.results.length > 0) tvdbId = results.results[0]!.externalId;
      } catch { /* not found */ }
    }
    if (!tvdbId) return;
    if (!isAlreadyTvdb) await updateMedia(db, mediaId, { tvdbId });
  }

  // Fetch TVDB structure in English only (fast, no per-language episode fetching)
  const tvdbData = await tvdb.getMetadata(tvdbId, "show");

  if (!tvdbData.seasons || tvdbData.seasons.length === 0) {
    console.log(`[reconcile] "${enTitle}": TVDB has no seasons, skipping`);
    return;
  }

  // Apply TVDB season/episode structure (TMDB shows only — TVDB-native already has it)
  // Uses applyTvdbSeasons which handles: detach/re-attach user data (playback,
  // history, ratings, files), transaction safety, and TMDB still image overlay.
  if (!isAlreadyTvdb) {
    // Build a minimal NormalizedMedia to pass TMDB seasons for still overlay
    const tmdbNormalized = { ...tvdbData, provider: row.provider, externalId: row.externalId } as import("@canto/providers").NormalizedMedia;
    // Fetch TMDB metadata to get episode stills for overlay
    try {
      const tmdbData = await deps.tmdb.getMetadata(row.externalId, "show");
      if (tmdbData.seasons) tmdbNormalized.seasons = tmdbData.seasons;
    } catch { /* keep TVDB seasons if TMDB fails */ }

    await applyTvdbSeasons(db, mediaId, tvdbData.seasons!, tmdbNormalized);
  }

  const supportedLangs = [...(await getActiveUserLanguages(db))];

  // For TVDB-native shows: fetch TMDB data for images, translations, and stills
  // For TMDB-native shows: stills already handled by applyTvdbSeasons above,
  // but we still need TMDB images and translations with supported languages
  let tmdbExternalId: number | undefined;
  if (!isAlreadyTvdb) {
    tmdbExternalId = row.externalId;
  } else if (row.imdbId && deps.tmdb.findByImdbId) {
    try {
      const found = await deps.tmdb.findByImdbId(row.imdbId);
      const match = found.find((r: { type: string }) => r.type === "show");
      if (match) tmdbExternalId = match.externalId;
    } catch { /* IMDB cross-ref failed */ }
  }

  if (tmdbExternalId) {
    try {
      const tmdbMeta = await deps.tmdb.getMetadata(tmdbExternalId, "show", { supportedLanguages: supportedLangs });

      // For TVDB-native shows, also overlay stills (TMDB-native already done in applyTvdbSeasons)
      if (isAlreadyTvdb && tmdbMeta.seasons) {
        const tmdbEpMap = buildTmdbEpisodeMap(tmdbMeta.seasons);
        await overlayTmdbEpisodeData(db, mediaId, tmdbEpMap);
        await overlayTmdbSeasonData(db, mediaId, tmdbMeta.seasons);
      }

      // Update base media (only language-agnostic fields after Phase 1C-δ).
      if (tmdbMeta.backdropPath) {
        await updateMedia(db, mediaId, { backdropPath: tmdbMeta.backdropPath });
      }

      // Persist the localized image fields into media_localization en-US.
      // backdropPath stays only on the base media row.
      if (tmdbMeta.posterPath || tmdbMeta.logoPath) {
        await upsertMediaLocalization(
          db,
          mediaId,
          "en-US",
          {
            title: enTitle,
            ...(tmdbMeta.posterPath ? { posterPath: tmdbMeta.posterPath } : {}),
            ...(tmdbMeta.logoPath ? { logoPath: tmdbMeta.logoPath } : {}),
          },
          "tmdb",
        );
      }

      // Persist TMDB media-level translations (title, overview, posters, logos)
      if (tmdbMeta.translations) {
        await persistTranslations(db, mediaId, {
          ...tmdbMeta,
          seasonTranslations: undefined,
          episodeTranslations: undefined,
        } as typeof tmdbMeta);
      }
    } catch (err) {
      console.warn(`[reconcile] TMDB backfill failed for "${enTitle}":`, err instanceof Error ? err.message : err);
    }
  }

  // Dispatch per-language episode translation jobs in background. Skipped
  // when called from the enrichment orchestrator because the `translations`
  // strategy will run in the same `ensureMedia` pass and handles those
  // languages directly — avoiding duplicate jobs in the queue.
  const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
  const dispatchTranslations = options?.dispatchTranslations !== false;
  const dispatcher = deps.dispatcher;
  if (dispatchTranslations && dispatcher) {
    for (const lang of nonEnLangs) {
      void dispatcher
        .enrichMedia(mediaId, { aspects: ["translations"], languages: [lang] })
        .catch(logAndSwallow("reconcile enrichMedia translations"));
    }
  }

  const tvdbSeasonCount = tvdbData.seasons.filter((s) => s.number > 0).length;
  console.log(
    `[reconcile] "${enTitle}": TVDB structure applied (${tvdbSeasonCount} seasons, ${tvdbData.numberOfEpisodes ?? 0} eps), ${nonEnLangs.length} translation jobs dispatched`,
  );
}
