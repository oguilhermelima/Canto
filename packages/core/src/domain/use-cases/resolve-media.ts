import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { MediaType, NormalizedMedia, NormalizedSeason, ProviderName } from "@canto/providers";
import { getSetting } from "@canto/db/settings";
import { getSupportedLanguageCodes } from "@canto/db/persist-media";
import { findMediaByExternalId } from "../../infrastructure/repositories/media-repository";
import { getEffectiveProviderSync } from "../rules/effective-provider";
import { fetchMediaMetadata } from "./fetch-media-metadata";
import { loadExtrasFromDB } from "../services/extras-service";
import { applyMediaTranslation, applySeasonsTranslation } from "../services/translation-service";
import { getUserLanguage } from "../services/user-service";
import { normalizedMediaToResponse } from "../mappers/media-mapper";
import { dispatchRefreshExtras } from "../../infrastructure/queue/bullmq-dispatcher";
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

  // Return from DB when metadata is complete — translations will be applied
  if (existing?.metadataUpdatedAt) {
    const lang = await getUserLanguage(db, userId);
    const translated = await applyMediaTranslation(db, existing, lang);
    if (translated.seasons) {
      await applySeasonsTranslation(db, translated.seasons as any, lang);
    }
    const extras = await loadExtrasFromDB(db, existing.id, lang);

    // Dispatch extras refresh in background if missing or stale
    if (!existing.extrasUpdatedAt) {
      void dispatchRefreshExtras(existing.id).catch(logAndSwallow("resolveMedia dispatchRefreshExtras"));
    }

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

  // Apply user's language translation from the live TMDB response
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
    persisted: !!existing,
    mediaId: existing?.id,
    inLibrary: existing?.inLibrary ?? false,
    downloaded: existing?.downloaded ?? false,
  };
}
