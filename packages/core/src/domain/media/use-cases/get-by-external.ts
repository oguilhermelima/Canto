import type { Database } from "@canto/db/client";
import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { MediaType, ProviderName } from "@canto/providers";
import type { SeasonWithEpisodes } from "@canto/core/domain/media/types/season";
import { persistMedia } from "@canto/core/domain/media/use-cases/persist";
import { getSetting } from "@canto/db/settings";
import { MediaPostInsertNotFoundError } from "@canto/core/domain/media/errors";
import {
  applyMediaLocalizationOverlay,
  applySeasonsLocalizationOverlay,
} from "@canto/core/domain/shared/localization/localization-service";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";
import { EXTRAS_TTL_MS } from "@canto/core/domain/media/use-cases/ensure-media.types";

interface GetByExternalInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
}

export interface GetByExternalDeps {
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
}

/**
 * "Persist on visit" — check DB first, otherwise fetch from provider and
 * insert media + seasons + episodes, then return the DB record.
 */
export async function getByExternal(
  db: Database,
  deps: GetByExternalDeps,
  input: GetByExternalInput,
  userId: string,
  providerFactory: (name: "tmdb" | "tvdb") => Promise<MediaProviderPort>,
  getSupportedLangs: () => Promise<string[]>,
) {
  const tvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
  const localization = deps.localization;

  const existing = tvdbEnabled
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

  const getUserLang = () => getUserLanguage(db, userId);

  if (existing) {
    const extrasSucceededAt = await deps.aspectState.findSucceededAt(
      existing.id,
      "extras",
    );
    const isStale =
      !extrasSucceededAt ||
      Date.now() - extrasSucceededAt.getTime() > EXTRAS_TTL_MS;
    if (isStale) {
      void deps.dispatcher
        .enrichMedia(existing.id, { aspects: ["extras"] })
        .catch(
          deps.logger.logAndSwallow(
            "media:getByExternal dispatchEnsureMedia(extras)",
          ),
        );
    }
    return localizeMediaForUser(existing, await getUserLang(), localization);
  }

  const provider = await providerFactory(input.provider);
  const supportedLangs = await getSupportedLangs();
  const normalized = await provider.getMetadata(input.externalId, input.type, {
    supportedLanguages: supportedLangs,
  });

  if (tvdbEnabled) {
    const crossRef = await deps.media.findByAnyReference(
      normalized.externalId,
      normalized.provider,
      normalized.imdbId ?? undefined,
      normalized.tvdbId ?? undefined,
    );
    if (crossRef) {
      return localizeMediaForUser(crossRef, await getUserLang(), localization);
    }
  }

  const inserted = await persistMedia(db, normalized, deps, {
    crossRefLookup: tvdbEnabled,
  });

  if (
    tvdbEnabled &&
    normalized.type === "show" &&
    normalized.provider === "tmdb"
  ) {
    void deps.dispatcher
      .enrichMedia(inserted.id, {
        aspects: ["structure"],
        force: true,
      })
      .catch(
        deps.logger.logAndSwallow(
          "media:getByExternal dispatchEnsureMedia(structure)",
        ),
      );
  }

  const result = await deps.media.findByIdWithSeasons(inserted.id);
  if (!result) throw new MediaPostInsertNotFoundError();
  return localizeMediaForUser(result, await getUserLang(), localization);
}

async function localizeMediaForUser<
  T extends { id: string; seasons?: SeasonWithEpisodes[] | null },
>(media: T, lang: string, localization: MediaLocalizationRepositoryPort) {
  const localized = await applyMediaLocalizationOverlay(media, lang, {
    localization,
  });
  if (localized.seasons && localized.seasons.length > 0) {
    const overlayed = await applySeasonsLocalizationOverlay(
      media.id,
      localized.seasons,
      lang,
      { localization },
    );
    return { ...localized, seasons: overlayed };
  }
  return localized;
}
