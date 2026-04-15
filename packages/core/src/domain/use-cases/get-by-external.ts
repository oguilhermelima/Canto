import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { MediaType, ProviderName } from "@canto/providers";
import { persistMedia } from "@canto/db/persist-media";
import { getSetting } from "@canto/db/settings";
import { logAndSwallow } from "../../lib/log-error";
import {
  findMediaByExternalId,
  findMediaByAnyReference,
  findMediaByIdWithSeasons,
} from "../../infrastructure/repositories/media-repository";
import { dispatchEnrichMedia, dispatchRefreshExtras, dispatchReconcileShow } from "../../infrastructure/queue/bullmq-dispatcher";
import { applyMediaTranslation, applySeasonsTranslation } from "../services/translation-service";
import { getUserLanguage } from "../services/user-service";

interface GetByExternalInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
}

/**
 * "Persist on visit" — check DB first, otherwise fetch from provider and
 * insert media + seasons + episodes, then return the DB record.
 */
export async function getByExternal(
  db: Database,
  input: GetByExternalInput,
  userId: string,
  providerFactory: (name: "tmdb" | "tvdb") => Promise<MediaProviderPort>,
  getSupportedLangs: () => Promise<string[]>,
) {
  const tvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;

  const existing = tvdbEnabled
    ? await findMediaByAnyReference(db, input.externalId, input.provider, undefined, undefined, input.type)
    : await findMediaByExternalId(db, input.externalId, input.provider, input.type);

  const getUserLang = () => getUserLanguage(db, userId);

  if (existing) {
    if (existing.processingStatus !== "ready") {
      void dispatchEnrichMedia(existing.id, true).catch(logAndSwallow("media:getByExternal dispatchEnrichMedia"));
    }
    if (existing.processingStatus === "ready") {
      const STALE_MS = 30 * 24 * 60 * 60 * 1000;
      const isStale = !existing.extrasUpdatedAt || Date.now() - existing.extrasUpdatedAt.getTime() > STALE_MS;
      if (isStale) void dispatchRefreshExtras(existing.id).catch(logAndSwallow("media:getByExternal dispatchRefreshExtras"));
    }
    const lang = await getUserLang();
    const translated = await applyMediaTranslation(db, existing, lang);
    if (translated.seasons) {
      await applySeasonsTranslation(db, translated.seasons as any, lang);
    }
    return translated;
  }

  const provider = await providerFactory(input.provider);
  const supportedLangs = await getSupportedLangs();
  const normalized = await provider.getMetadata(input.externalId, input.type, { supportedLanguages: supportedLangs });

  if (tvdbEnabled) {
    const crossRef = await findMediaByAnyReference(
      db, normalized.externalId, normalized.provider,
      normalized.imdbId, normalized.tvdbId,
    );
    if (crossRef) {
      const lang = await getUserLang();
      const translated = await applyMediaTranslation(db, crossRef, lang);
      if (translated.seasons) {
        await applySeasonsTranslation(db, translated.seasons as any, lang);
      }
      return translated;
    }
  }

  const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });

  if (tvdbEnabled && normalized.type === "show" && normalized.provider === "tmdb") {
    void dispatchReconcileShow(inserted.id).catch(logAndSwallow("media:getByExternal dispatchReconcileShow"));
  }

  const result = await findMediaByIdWithSeasons(db, inserted.id);
  if (!result) throw new Error("Media not found after insert");
  const lang = await getUserLang();
  const translated = await applyMediaTranslation(db, result, lang);
  if (translated.seasons) {
    await applySeasonsTranslation(db, translated.seasons as any, lang);
  }
  return translated;
}
