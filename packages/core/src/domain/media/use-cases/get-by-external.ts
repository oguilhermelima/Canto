import type { Database } from "@canto/db/client";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { MediaType, ProviderName } from "@canto/providers";
import { persistMedia } from "@canto/core/domain/media/use-cases/persist";
import { getSetting } from "@canto/db/settings";
import { findAspectSucceededAt } from "@canto/core/infra/media/media-aspect-state-repository";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import {
  applyMediaLocalizationOverlay,
  applySeasonsLocalizationOverlay,
} from "@canto/core/domain/shared/localization/localization-service";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";

interface GetByExternalInput {
  externalId: number;
  provider: ProviderName;
  type: MediaType;
}

export interface GetByExternalDeps {
  media: MediaRepositoryPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
  /** Optional — falls back to building from `db` when not supplied. */
  localization?: MediaLocalizationRepositoryPort;
}

/**
 * "Persist on visit" — check DB first, otherwise fetch from provider and
 * insert media + seasons + episodes, then return the DB record.
 *
 * Note: localization overlay (`applyMediaLocalizationOverlay`,
 * `applySeasonsLocalizationOverlay`) and aspect-state cadence reads still
 * resolve via the legacy infra helpers — those land on dedicated ports in
 * Wave 9B (localization) and 9B's cadence carve-out.
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
  const localization = deps.localization ?? makeMediaLocalizationRepository(db);

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
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const extrasSucceededAt = await findAspectSucceededAt(db, existing.id, "extras");
    const isStale = !extrasSucceededAt || Date.now() - extrasSucceededAt.getTime() > STALE_MS;
    if (isStale)
      void deps.dispatcher.enrichMedia(existing.id, { aspects: ["extras"] }).catch(
        deps.logger.logAndSwallow("media:getByExternal dispatchEnsureMedia(extras)"),
      );
    const lang = await getUserLang();
    const localized = await applyMediaLocalizationOverlay(existing, lang, {
      localization,
    });
    if (localized.seasons && localized.seasons.length > 0) {
      const overlayed = await applySeasonsLocalizationOverlay(
        existing.id,
        localized.seasons as any,
        lang,
        { localization },
      );
      return { ...localized, seasons: overlayed };
    }
    return localized;
  }

  const provider = await providerFactory(input.provider);
  const supportedLangs = await getSupportedLangs();
  const normalized = await provider.getMetadata(input.externalId, input.type, { supportedLanguages: supportedLangs });

  if (tvdbEnabled) {
    const crossRef = await deps.media.findByAnyReference(
      normalized.externalId,
      normalized.provider,
      normalized.imdbId ?? undefined,
      normalized.tvdbId ?? undefined,
    );
    if (crossRef) {
      const lang = await getUserLang();
      const localized = await applyMediaLocalizationOverlay(crossRef, lang, {
        localization,
      });
      if (localized.seasons && localized.seasons.length > 0) {
        const overlayed = await applySeasonsLocalizationOverlay(
          crossRef.id,
          localized.seasons as any,
          lang,
          { localization },
        );
        return { ...localized, seasons: overlayed };
      }
      return localized;
    }
  }

  const inserted = await persistMedia(db, normalized, { crossRefLookup: tvdbEnabled });

  if (tvdbEnabled && normalized.type === "show" && normalized.provider === "tmdb") {
    void deps.dispatcher.enrichMedia(inserted.id, {
      aspects: ["structure"],
      force: true,
    }).catch(deps.logger.logAndSwallow("media:getByExternal dispatchEnsureMedia(structure)"));
  }

  const result = await deps.media.findByIdWithSeasons(inserted.id);
  if (!result) throw new Error("Media not found after insert");
  const lang = await getUserLang();
  const localized = await applyMediaLocalizationOverlay(result, lang, {
    localization,
  });
  if (localized.seasons && localized.seasons.length > 0) {
    const overlayed = await applySeasonsLocalizationOverlay(
      result.id,
      localized.seasons as any,
      lang,
      { localization },
    );
    return { ...localized, seasons: overlayed };
  }
  return localized;
}
