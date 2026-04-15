import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { MediaType, ProviderName } from "@canto/providers";
import { getSetting } from "@canto/db/settings";
import { getSupportedLanguageCodes, persistFullMedia } from "@canto/db/persist-media";
import { logAndSwallow } from "../../lib/log-error";
import { getEffectiveProviderSync } from "../rules/effective-provider";
import {
  findMediaByExternalId,
  findMediaByAnyReference,
  findMediaByIdWithSeasons,
} from "../../infrastructure/repositories/media-repository";
import { dispatchTranslateEpisodes } from "../../infrastructure/queue/bullmq-dispatcher";
import { fetchMediaMetadata } from "./fetch-media-metadata";

interface PersistMediaInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
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

  if (existing?.processingStatus === "ready") return existing;

  const useTVDBSeasons = existing
    ? getEffectiveProviderSync(existing, globalTvdbEnabled) === "tvdb"
    : globalTvdbEnabled;

  const supportedLangs = [...await getSupportedLanguageCodes(db)];

  const result = await fetchMediaMetadata(
    input.externalId, input.provider, input.type,
    providers,
    { useTVDBSeasons, supportedLanguages: supportedLangs },
  );

  const mediaId = await persistFullMedia(db, result, existing?.id);

  if (result.tvdbId && result.tvdbSeasons?.length) {
    const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
    for (const lang of nonEnLangs) {
      void dispatchTranslateEpisodes(mediaId, result.tvdbId, lang).catch(logAndSwallow("media:persist dispatchTranslateEpisodes"));
    }
  }

  return findMediaByIdWithSeasons(db, mediaId);
}
