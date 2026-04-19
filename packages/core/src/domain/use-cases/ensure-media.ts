import type { Database } from "@canto/db/client";
import type { ProviderName, MediaType } from "@canto/providers";
import { findMediaById } from "../../infrastructure/repositories";
import type { MediaProviderPort } from "../ports/media-provider.port";
import { getActiveUserLanguages } from "../services/user-service";
import { detectGaps } from "./detect-gaps";
import type {
  Aspect,
  EnsureMediaResult,
  EnsureMediaSpec,
} from "./ensure-media.types";
import { ALL_ASPECTS } from "./ensure-media.types";
import { fetchMediaMetadata } from "./fetch-media-metadata";
import { updateMediaFromNormalized } from "./persist-media";
import { refreshExtras } from "./refresh-extras";
import { upsertLangLogos } from "./upsert-lang-logos";
import { getTmdbProvider } from "../../lib/tmdb-client";
import { getTvdbProvider } from "../../lib/tvdb-client";
import { getSetting } from "@canto/db/settings";
import { translateEpisodes } from "./translate-episodes";
import type { TvdbProvider } from "@canto/providers";

/**
 * Unified "make sure this media is complete" engine.
 *
 * Callers specify what they need (languages + aspects) and the engine runs
 * the minimum set of provider calls. Idempotent and safe to re-run.
 *
 * Execution order: structure → metadata + translations (shared call) → logos
 * → extras. Each stage's writes become visible to later stages.
 */
export async function ensureMedia(
  db: Database,
  mediaId: string,
  spec: EnsureMediaSpec = {},
  providers?: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
): Promise<EnsureMediaResult> {
  const start = Date.now();
  const result: EnsureMediaResult = initResult(mediaId);

  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) {
    throw new Error(`ensureMedia: media ${mediaId} not found`);
  }

  const languages = (spec.languages ?? [...(await getActiveUserLanguages(db))]).filter(
    (l) => !!l,
  );
  result.languagesProcessed = languages;

  let aspectsToRun: Aspect[];
  if (spec.force) {
    aspectsToRun = spec.aspects ?? ALL_ASPECTS;
  } else if (spec.aspects && spec.aspects.length > 0) {
    aspectsToRun = spec.aspects;
  } else {
    const gaps = await detectGaps(db, mediaId, languages);
    aspectsToRun = gaps.gaps;
  }

  if (aspectsToRun.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  const deps = providers ?? {
    tmdb: await getTmdbProvider(),
    tvdb: await getTvdbProvider(),
  };

  // Fuse metadata + translations — both served by a single fetchMediaMetadata
  // call with per-lang append_to_response chunks inside the TMDB normalizer.
  const runMetadata = aspectsToRun.includes("metadata");
  const runTranslations = aspectsToRun.includes("translations");
  const runStructure = aspectsToRun.includes("structure");
  const runLogos = aspectsToRun.includes("logos");
  const runExtras = aspectsToRun.includes("extras");

  if (runMetadata || runTranslations || runStructure) {
    const useTVDBSeasons = mediaRow.type === "show"
      && !!mediaRow.tvdbId
      && (await getSetting("tvdb.defaultShows")) === true;

    const langsForFetch = runTranslations
      ? languages
      : languages.filter((l) => l.startsWith("en"));

    const fetched = await fetchMediaMetadata(
      mediaRow.externalId,
      mediaRow.provider as ProviderName,
      mediaRow.type as MediaType,
      deps,
      {
        useTVDBSeasons,
        supportedLanguages: langsForFetch,
        reprocess: spec.force,
      },
    );
    result.providerCalls.tmdb += 1;
    if (fetched.tvdbSeasons) result.providerCalls.tvdb += 1;

    await updateMediaFromNormalized(db, mediaId, fetched.media);
    result.writes.media = true;
    if (runStructure) result.aspectsExecuted.push("structure");
    if (runMetadata) result.aspectsExecuted.push("metadata");
    if (runTranslations) result.aspectsExecuted.push("translations");

    // TVDB episode-translation fallback for shows that TMDB didn't cover.
    // Runs sequentially inside this job so the worker doesn't dispatch a
    // second ensure-media run (avoiding cycles through the legacy dispatcher).
    if (runTranslations && mediaRow.type === "show" && mediaRow.tvdbId) {
      for (const lang of languages) {
        if (lang.startsWith("en")) continue;
        try {
          await translateEpisodes(
            db,
            mediaId,
            mediaRow.tvdbId,
            lang,
            deps.tvdb as unknown as TvdbProvider,
          );
          result.providerCalls.tvdb += 1;
        } catch {
          // TVDB may not have translations for this language — non-fatal.
        }
      }
    }
  }

  if (runLogos) {
    const logosWritten = await fetchAndPersistLogos(
      db,
      mediaId,
      mediaRow.externalId,
      mediaRow.type as MediaType,
      languages,
      deps.tmdb,
    );
    result.providerCalls.tmdb += logosWritten.calls;
    result.writes.logos = logosWritten.writes;
    if (logosWritten.calls > 0) result.aspectsExecuted.push("logos");
  }

  if (runExtras) {
    await refreshExtras(db, mediaId, { tmdb: deps.tmdb });
    result.providerCalls.tmdb += 1;
    result.aspectsExecuted.push("extras");
  }

  result.durationMs = Date.now() - start;
  return result;
}

function initResult(mediaId: string): EnsureMediaResult {
  return {
    mediaId,
    aspectsExecuted: [],
    languagesProcessed: [],
    providerCalls: { tmdb: 0, tvdb: 0 },
    writes: {
      media: false,
      structureSeasons: 0,
      structureEpisodes: 0,
      translationsMedia: 0,
      translationsSeason: 0,
      translationsEpisode: 0,
      logos: 0,
      extras: 0,
    },
    skipped: {},
    durationMs: 0,
  };
}

/**
 * Fetch language-specific logos via TMDB `/{type}/{id}/images` and upsert the
 * best match per language via the shared `upsertLangLogos` helper.
 */
async function fetchAndPersistLogos(
  db: Database,
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

  const writes = await upsertLangLogos(db, mediaId, byLang, nonEnLangs);
  return { calls: 1, writes };
}

// Re-export the base media row helper so that callers building bulk flows
// don't need a second import.
export { findMediaById };
