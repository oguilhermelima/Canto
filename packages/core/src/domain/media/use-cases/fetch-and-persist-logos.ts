import type { MediaType } from "@canto/providers";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import { upsertLangLogos } from "@canto/core/domain/content-enrichment/use-cases/upsert-lang-logos";

/**
 * Fetch language-specific logos via TMDB `/{type}/{id}/images` and upsert
 * the best match per language via the shared `upsertLangLogos` helper.
 *
 * Returns the count of provider calls actually made (0 when there is no
 * non-en language to look up) and the number of language rows written.
 */
export async function fetchAndPersistLogos(
  deps: { localization: MediaLocalizationRepositoryPort },
  mediaId: string,
  externalId: number,
  type: MediaType,
  languages: string[],
  tmdb: MediaProviderPort,
): Promise<{ calls: number; writes: number }> {
  if (!tmdb.getImages) return { calls: 0, writes: 0 };

  const nonEnLangs = languages.filter((l) => !l.startsWith("en"));
  if (nonEnLangs.length === 0) return { calls: 0, writes: 0 };

  const tmdbType = type === "show" ? "tv" : "movie";
  const images = await tmdb.getImages(externalId, tmdbType);
  const logos = images.logos ?? [];

  const byLang = new Map<string, string>();
  for (const l of logos) {
    if (!l.iso_639_1 || l.iso_639_1 === "en") continue;
    if (!byLang.has(l.iso_639_1)) byLang.set(l.iso_639_1, l.file_path);
  }
  if (byLang.size === 0) return { calls: 1, writes: 0 };

  const writes = await upsertLangLogos(deps, mediaId, byLang, nonEnLangs);
  return { calls: 1, writes };
}
