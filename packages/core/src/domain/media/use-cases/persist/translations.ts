import type { Database } from "@canto/db/client";
import type { NormalizedMedia } from "@canto/providers";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { LocalizationSource } from "@canto/core/domain/media/types/media-localization";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";

interface PersistTranslationsDeps {
  localization: MediaLocalizationRepositoryPort;
  media: MediaRepositoryPort;
  userPrefs: UserPreferencesPort;
}

/**
 * Persist non-English translations for a media (and its seasons/episodes when
 * present) into `media_localization` / `season_localization` /
 * `episode_localization`.
 */
export async function persistTranslations(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
  deps: PersistTranslationsDeps,
): Promise<void> {
  const localization = deps.localization;

  const supported = await getActiveUserLanguages(deps);
  const locSource: LocalizationSource =
    normalized.provider === "tvdb" ? "tvdb" : "tmdb";

  if (normalized.translations && normalized.translations.length > 0) {
    const mTransSeen = new Set<string>();
    const mediaTransRows = normalized.translations
      .filter(
        (t) =>
          !t.language.startsWith("en-") &&
          supported.has(t.language) &&
          (t.title !== undefined || t.overview !== undefined),
      )
      .map((t) => ({
        mediaId,
        language: t.language,
        title: t.title ?? null,
        overview: t.overview ?? null,
        tagline: t.tagline ?? null,
        posterPath: t.posterPath ?? null,
        logoPath: t.logoPath ?? null,
      }))
      .filter((r) => {
        const key = `${r.mediaId}-${r.language}`;
        if (mTransSeen.has(key)) return false;
        mTransSeen.add(key);
        return true;
      });

    for (const r of mediaTransRows) {
      if (!r.title) continue;
      await localization.upsertMediaLocalization(
        r.mediaId,
        r.language,
        {
          title: r.title,
          overview: r.overview,
          tagline: r.tagline,
          posterPath: r.posterPath,
          logoPath: r.logoPath,
        },
        locSource,
      );
    }
  }

  const hasSeasonTranslations =
    normalized.seasonTranslations !== undefined &&
    normalized.seasonTranslations.length > 0;
  const hasEpisodeTranslations =
    normalized.episodeTranslations !== undefined &&
    normalized.episodeTranslations.length > 0;
  const needSeasonLookup = hasSeasonTranslations || hasEpisodeTranslations;

  if (!needSeasonLookup) return;

  const seasons = await deps.media.findSeasonsByMediaId(mediaId);
  const seasonIdByNumber = new Map(seasons.map((s) => [s.number, s.id]));

  if (
    normalized.seasonTranslations &&
    normalized.seasonTranslations.length > 0
  ) {
    const sTransSeen = new Set<string>();
    const seasonTransRows = normalized.seasonTranslations
      .filter((t) => {
        if (t.language.startsWith("en-") || !supported.has(t.language))
          return false;
        const sid = seasonIdByNumber.get(t.seasonNumber);
        return sid !== undefined && (t.name !== undefined || t.overview !== undefined);
      })
      .map((t) => {
        const seasonId = seasonIdByNumber.get(t.seasonNumber);
        if (!seasonId) return null;
        return {
          seasonId,
          language: t.language,
          name: t.name ?? null,
          overview: t.overview ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => {
        const key = `${r.seasonId}-${r.language}`;
        if (sTransSeen.has(key)) return false;
        sTransSeen.add(key);
        return true;
      });

    for (const r of seasonTransRows) {
      await localization.upsertSeasonLocalization(
        r.seasonId,
        r.language,
        { name: r.name, overview: r.overview },
        locSource,
      );
    }
  }

  if (
    normalized.episodeTranslations &&
    normalized.episodeTranslations.length > 0
  ) {
    if (seasons.length === 0) return;

    const episodeLookup = new Map<string, string>();
    for (const s of seasons) {
      for (const ep of s.episodes) {
        episodeLookup.set(`${s.number}-${ep.number}`, ep.id);
      }
    }

    const epTransRowsRaw = normalized.episodeTranslations
      .filter(
        (t) => !t.language.startsWith("en-") && supported.has(t.language),
      )
      .map((t) => {
        const epId = episodeLookup.get(`${t.seasonNumber}-${t.episodeNumber}`);
        if (!epId || (!t.title && !t.overview)) return null;
        return {
          episodeId: epId,
          language: t.language,
          title: t.title ?? null,
          overview: t.overview ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Postgres rejects duplicates within the same batch.
    const epTransSeen = new Set<string>();
    const epTransRows = epTransRowsRaw.filter((r) => {
      const key = `${r.episodeId}-${r.language}`;
      if (epTransSeen.has(key)) return false;
      epTransSeen.add(key);
      return true;
    });

    for (const r of epTransRows) {
      await localization.upsertEpisodeLocalization(
        r.episodeId,
        r.language,
        { title: r.title, overview: r.overview },
        locSource,
      );
    }
  }
}
