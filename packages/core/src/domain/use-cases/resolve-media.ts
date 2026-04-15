import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { MediaType, NormalizedMedia, NormalizedSeason, ProviderName } from "@canto/providers";
import { getSetting } from "@canto/db/settings";
import { getSupportedLanguageCodes, persistFullMedia } from "@canto/db/persist-media";
import { findMediaByExternalId, findMediaByIdWithSeasons } from "../../infrastructure/repositories/media-repository";
import { getEffectiveProviderSync } from "../rules/effective-provider";
import { fetchMediaMetadata } from "./fetch-media-metadata";
import { loadExtrasFromDB } from "../services/extras-service";
import { applyMediaTranslation, applySeasonsTranslation } from "../services/translation-service";
import { getUserLanguage } from "../services/user-service";
import { normalizedMediaToResponse } from "../mappers/media-mapper";
import { dispatchTranslateEpisodes } from "../../infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "../../lib/log-error";

interface ResolveMediaInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
}

/**
 * Resolve media by external ID — returns complete metadata without persisting.
 * For already-persisted media: returns from DB with translations + extras.
 * For new media: fetches live from providers and returns without persisting.
 */
export async function resolveMedia(
  db: Database,
  input: ResolveMediaInput,
  userId: string,
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
) {
  const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;

  const existing = await findMediaByExternalId(db, input.externalId, input.provider, input.type);

  // Return from DB only when FULLY persisted (metadata + extras both present)
  if (existing?.metadataUpdatedAt && existing.extrasUpdatedAt) {
    const lang = await getUserLanguage(db, userId);
    const translated = await applyMediaTranslation(db, existing, lang);
    if (translated.seasons) {
      await applySeasonsTranslation(db, translated.seasons as any, lang);
    }
    const extras = await loadExtrasFromDB(db, existing.id, lang);

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

  const useTVDBSeasons = existing
    ? getEffectiveProviderSync(existing, globalTvdbEnabled) === "tvdb"
    : globalTvdbEnabled;

  const supportedLangs = [...await getSupportedLanguageCodes(db)];

  const result = await fetchMediaMetadata(
    input.externalId, input.provider, input.type,
    providers,
    { useTVDBSeasons, supportedLanguages: supportedLangs },
  );

  // Persist on resolve: save to DB so future visits hit the fast DB path
  const mediaId = await persistFullMedia(db, result, existing?.id);

  // Dispatch TVDB episode translations for non-English languages
  if (result.tvdbId && result.tvdbSeasons?.length) {
    const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
    for (const lang of nonEnLangs) {
      void dispatchTranslateEpisodes(mediaId, result.tvdbId, lang).catch(logAndSwallow("resolveMedia dispatchTranslateEpisodes"));
    }
  }

  // Re-read from DB to get the fully persisted + normalized row
  const persisted = await findMediaByIdWithSeasons(db, mediaId);
  if (persisted) {
    const lang = await getUserLanguage(db, userId);
    const translated = await applyMediaTranslation(db, persisted, lang);
    if (translated.seasons) {
      await applySeasonsTranslation(db, translated.seasons as any, lang);
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
