import type { Database } from "@canto/db/client";
import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type {
  Aspect,
  GapReport,
} from "@canto/core/domain/media/use-cases/ensure-media.types";
import {
  EXTRAS_TTL_MS,
  METADATA_TTL_MS,
} from "@canto/core/domain/media/use-cases/ensure-media.types";

export interface DetectGapsDeps {
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  extras: MediaExtrasRepositoryPort;
}

/**
 * Inspect DB state and compute what's missing for the given languages.
 * Pure read — no writes, no provider calls.
 *
 * Returns:
 * - `gaps`: aspects that have at least one hole for the requested langs.
 * - `details`: per-aspect breakdown so callers can display meaningful info.
 */
export async function detectGaps(
  // The `db` parameter is retained on the public signature so existing
  // callers in other contexts keep their `(db, mediaId, languages)` shape;
  // future deprecations will switch to a deps-only signature.
  _db: Database,
  deps: DetectGapsDeps,
  mediaId: string,
  languages: string[],
): Promise<GapReport> {
  const mediaRow = await deps.media.findById(mediaId);

  if (!mediaRow) {
    return {
      mediaId,
      languages,
      gaps: [],
      details: {
        metadataStale: false,
        structureMissing: false,
        translationsMissingByLang: {},
        logosMissingByLang: [],
        extrasStale: false,
        contentRatingsMissing: false,
      },
    };
  }

  const nonEnLangs = languages.filter((l) => !l.startsWith("en"));
  const isShow = mediaRow.type === "show";

  const [
    seasonCount,
    episodeCount,
    translationCounts,
    logoLangs,
    extrasCount,
    contentRatingCount,
    metadataSucceededAt,
    extrasSucceededAt,
  ] = await Promise.all([
    isShow ? deps.media.countSeasonsByMediaId(mediaId) : Promise.resolve(0),
    isShow ? deps.media.countEpisodesByMediaId(mediaId) : Promise.resolve(0),
    nonEnLangs.length > 0
      ? deps.localization.countTranslationsPerLanguage(
          mediaId,
          nonEnLangs,
          isShow,
        )
      : Promise.resolve<
          Record<string, { media: number; season: number; episode: number }>
        >({}),
    nonEnLangs.length > 0
      ? deps.localization.findLogoLanguagesByMediaId(mediaId)
      : Promise.resolve<string[]>([]),
    deps.extras.countCreditsByMediaId(mediaId),
    deps.contentRating.countByMediaId(mediaId),
    deps.aspectState.findSucceededAt(mediaId, "metadata"),
    deps.aspectState.findSucceededAt(mediaId, "extras"),
  ]);

  const now = Date.now();
  const metadataStale =
    !metadataSucceededAt ||
    now - metadataSucceededAt.getTime() > METADATA_TTL_MS;

  const structureMissing = isShow && seasonCount === 0;

  const translationsMissingByLang: GapReport["details"]["translationsMissingByLang"] =
    {};
  for (const lang of nonEnLangs) {
    const counts = translationCounts[lang] ?? {
      media: 0,
      season: 0,
      episode: 0,
    };
    const mediaMissing = counts.media === 0;
    const seasonGaps = Math.max(0, seasonCount - counts.season);
    const episodeGaps = Math.max(0, episodeCount - counts.episode);
    if (mediaMissing || seasonGaps > 0 || episodeGaps > 0) {
      translationsMissingByLang[lang] = {
        media: mediaMissing,
        seasons: seasonGaps,
        episodes: episodeGaps,
      };
    }
  }

  const logoLangSet = new Set(logoLangs);
  const logosMissingByLang = nonEnLangs.filter((l) => !logoLangSet.has(l));

  const extrasStale =
    !extrasSucceededAt ||
    now - extrasSucceededAt.getTime() > EXTRAS_TTL_MS ||
    extrasCount === 0;

  const contentRatingsMissing = contentRatingCount === 0;

  const gaps: Aspect[] = [];
  if (metadataStale) gaps.push("metadata");
  if (structureMissing) gaps.push("structure");
  if (Object.keys(translationsMissingByLang).length > 0)
    gaps.push("translations");
  if (logosMissingByLang.length > 0) gaps.push("logos");
  if (extrasStale) gaps.push("extras");
  if (contentRatingsMissing) gaps.push("contentRatings");

  return {
    mediaId,
    languages,
    gaps,
    details: {
      metadataStale,
      structureMissing,
      translationsMissingByLang,
      logosMissingByLang,
      extrasStale,
      contentRatingsMissing,
    },
  };
}
