import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import type { MediaType, ProviderName } from "@canto/providers";
import { persistMedia } from "./persist";
import { getSetting } from "@canto/db/settings";
import { logAndSwallow } from "../../../platform/logger/log-error";
import {
  findMediaByExternalId,
  findMediaByAnyReference,
  findMediaByIdWithSeasons,
  findAspectSucceededAt,
} from "../../../infra/repositories";
import { dispatchEnsureMedia } from "../../../platform/queue/bullmq-dispatcher";
import {
  applyMediaLocalizationOverlay,
  applySeasonsLocalizationOverlay,
} from "../../shared/localization";
import { getUserLanguage } from "../../shared/services/user-service";

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
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const extrasSucceededAt = await findAspectSucceededAt(db, existing.id, "extras");
    const isStale = !extrasSucceededAt || Date.now() - extrasSucceededAt.getTime() > STALE_MS;
    if (isStale)
      void dispatchEnsureMedia(existing.id, { aspects: ["extras"] }).catch(
        logAndSwallow("media:getByExternal dispatchEnsureMedia(extras)"),
      );
    const lang = await getUserLang();
    const localized = await applyMediaLocalizationOverlay(db, existing, lang);
    if (localized.seasons && localized.seasons.length > 0) {
      const overlayed = await applySeasonsLocalizationOverlay(db, existing.id, localized.seasons as any, lang);
      return { ...localized, seasons: overlayed };
    }
    return localized;
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
      const localized = await applyMediaLocalizationOverlay(db, crossRef, lang);
      if (localized.seasons && localized.seasons.length > 0) {
        const overlayed = await applySeasonsLocalizationOverlay(db, crossRef.id, localized.seasons as any, lang);
        return { ...localized, seasons: overlayed };
      }
      return localized;
    }
  }

  const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });

  if (tvdbEnabled && normalized.type === "show" && normalized.provider === "tmdb") {
    void dispatchEnsureMedia(inserted.id, {
      aspects: ["structure"],
      force: true,
    }).catch(logAndSwallow("media:getByExternal dispatchEnsureMedia(structure)"));
  }

  const result = await findMediaByIdWithSeasons(db, inserted.id);
  if (!result) throw new Error("Media not found after insert");
  const lang = await getUserLang();
  const localized = await applyMediaLocalizationOverlay(db, result, lang);
  if (localized.seasons && localized.seasons.length > 0) {
    const overlayed = await applySeasonsLocalizationOverlay(db, result.id, localized.seasons as any, lang);
    return { ...localized, seasons: overlayed };
  }
  return localized;
}
