import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { persistFullMedia } from "./persist-media";
import { getActiveUserLanguages } from "../services/user-service";
import type { MediaType, ProviderName } from "@canto/providers";

import type { MediaProviderPort } from "../ports/media-provider.port";
import { getEffectiveProviderSync } from "../rules/effective-provider";
import { findMediaById } from "../../infrastructure/repositories";
import type { MediaPipelineJob } from "../../infrastructure/queue/bullmq-dispatcher";
import { dispatchTranslateEpisodes } from "../../infrastructure/queue/bullmq-dispatcher";

import { fetchMediaMetadata } from "./fetch-media-metadata";

interface Deps {
  tmdb: MediaProviderPort;
  tvdb: MediaProviderPort;
}

/**
 * Resolve input → fetch metadata → persist → fan out translation jobs.
 *
 * Two entry shapes:
 * - `mediaId`: reprocess an existing row (provider/type/external ID come from DB).
 * - `externalId + provider + type`: import a new media from its provider identity.
 *
 * Translation jobs are fire-and-forget; one bad language shouldn't stall the pipeline.
 */
export async function runMediaPipeline(
  db: Database,
  data: MediaPipelineJob,
  deps: Deps,
): Promise<void> {
  const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
  const supportedLangs = [...(await getActiveUserLanguages(db))];

  let externalId: number;
  let provider: ProviderName;
  let type: MediaType;
  let existingId: string | undefined;
  let useTVDBSeasons: boolean;

  if (data.mediaId) {
    const row = await findMediaById(db, data.mediaId);
    if (!row) return;
    externalId = row.externalId;
    provider = row.provider as ProviderName;
    type = row.type as MediaType;
    existingId = row.id;
    useTVDBSeasons = getEffectiveProviderSync(row, globalTvdbEnabled) === "tvdb";
  } else {
    externalId = data.externalId!;
    provider = data.provider! as ProviderName;
    type = data.type! as MediaType;
    useTVDBSeasons = data.useTVDBSeasons ?? globalTvdbEnabled;
  }

  const result = await fetchMediaMetadata(
    externalId,
    provider,
    type,
    { tmdb: deps.tmdb, tvdb: deps.tvdb },
    { reprocess: !!existingId, useTVDBSeasons, supportedLanguages: supportedLangs },
  );

  const mediaId = await persistFullMedia(db, result, existingId);

  if (result.tvdbId && result.tvdbSeasons?.length) {
    const nonEnLangs = supportedLangs.filter((l) => !l.startsWith("en"));
    for (const lang of nonEnLangs) {
      void dispatchTranslateEpisodes(mediaId, result.tvdbId, lang).catch(() => {});
    }
  }
}
