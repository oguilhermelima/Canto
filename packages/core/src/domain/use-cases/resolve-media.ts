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

  const existing = await findMediaByExternalId(db, input.externalId, input.provider);

  if (existing?.extrasUpdatedAt) {
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

  return {
    source: "live" as const,
    media: normalizedMediaToResponse(result.media, result.tvdbSeasons),
    extras: result.extras,
    persisted: !!existing,
    mediaId: existing?.id,
    inLibrary: existing?.inLibrary ?? false,
    downloaded: existing?.downloaded ?? false,
  };
}
