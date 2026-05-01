import { eq, and } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { media } from "@canto/db/schema";

import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { SearchResult } from "@canto/providers";
import {
  resolveSupportedLocale,
  upsertLangLogos,
} from "@canto/core/domain/content-enrichment/use-cases/upsert-lang-logos";
import { upsertMediaLocalization } from "@canto/core/domain/shared/localization/localization-service";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { dispatchEnsureMedia } from "@canto/core/platform/queue/bullmq-dispatcher";

/** Deduplicates concurrent getImages calls for the same externalId */
const inflightFetches = new Map<string, Promise<string | undefined>>();

export interface FetchLogosDeps {
  logger: LoggerPort;
}

export interface FetchLogoItem {
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  year?: number | null;
  voteAverage?: number | null;
}

/**
 * Fetch logos for a batch of browse items.
 *
 * 1. Check DB for existing media records with logoPath; when `language` is
 *    given, prefer `media_translation.logoPath` over the base English logo.
 * 2. For items without logos, batch-fetch from TMDB getImages()
 * 3. Upsert minimal media records with the fetched logos (and language-specific
 *    variants in `media_translation` so future calls hit the translated path).
 *
 * Returns a map of "provider-type-externalId" → logoPath (or null if no logo).
 */
export async function fetchLogos(
  db: Database,
  deps: FetchLogosDeps,
  tmdb: MediaProviderPort,
  items: FetchLogoItem[],
  language?: string,
): Promise<Record<string, string | null>> {
  if (items.length === 0) return {};

  const result: Record<string, string | null> = {};
  const useLangJoin = !!language && !language.startsWith("en");

  // 1. Query DB for existing records (match by externalId+provider+type triples).
  // Wave 9C2: localization overlay JOIN moved into the
  // `MediaLocalizationRepositoryPort.findLogoOverlayByExternalRefs` helper —
  // browse-time logo resolution flows through the port like every other
  // localization read.
  const localization = makeMediaLocalizationRepository(db);
  const existingRows = await localization.findLogoOverlayByExternalRefs(
    items.map((i) => ({
      externalId: i.externalId,
      provider: i.provider,
      type: i.type,
    })),
    useLangJoin ? language : "en-US",
  );

  const existingByKey = new Map(existingRows.map((r) => [`${r.type}-${r.externalId}`, r]));

  // 2. Classify items. With a translated logo present, treat it as resolved.
  const needsFetch: FetchLogoItem[] = [];
  for (const item of items) {
    const key = `${item.provider}-${item.type}-${item.externalId}`;
    const existing = existingByKey.get(`${item.type}-${item.externalId}`);
    if (existing?.logoPath) {
      result[key] = existing.logoPath;
    } else {
      needsFetch.push(item);
    }
  }

  if (needsFetch.length === 0) return result;

  // Active locales drive both (a) which TMDB-tagged logo we surface for the
  // user's language right now and (b) what `upsertLangLogos` persists for
  // future requests. Cached for 5 minutes by `getActiveUserLanguages`, so
  // hoisting the fetch here keeps the per-item loop synchronous while
  // sharing the same set across response and write paths.
  const supported = useLangJoin
    ? await getActiveUserLanguages(db)
    : null;

  // 3. Batch fetch logos from TMDB (groups of 10)
  const logoMap = new Map<string, string>();
  const langLogoMap = new Map<string, Map<string, string>>();

  if (tmdb.getImages) {
    for (let i = 0; i < needsFetch.length; i += 10) {
      const batch = needsFetch.slice(i, i + 10);
      await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const cacheKey = `${item.type}-${item.externalId}`;
            let existing = inflightFetches.get(cacheKey);
            if (!existing) {
              existing = (async () => {
                const tmdbType = item.type === "show" ? "tv" as const : "movie" as const;
                const images = await tmdb.getImages!(item.externalId, tmdbType);
                const logos = images.logos ?? [];

                // Store best logo per language for translations
                const byLang = new Map<string, string>();
                for (const l of logos) {
                  if (l.iso_639_1 && l.iso_639_1 !== "en" && !byLang.has(l.iso_639_1)) {
                    byLang.set(l.iso_639_1, l.file_path);
                  }
                }
                if (byLang.size > 0) {
                  langLogoMap.set(`${item.type}-${item.externalId}`, byLang);
                }

                // Pick best English/null logo for base record
                const enLogos = logos.filter(
                  (l) => l.iso_639_1 === "en" || l.iso_639_1 === null,
                );
                return enLogos.length > 0 ? enLogos[0]!.file_path : undefined;
              })();
              inflightFetches.set(cacheKey, existing);
            }
            const logoPath = await existing;
            inflightFetches.delete(cacheKey);
            if (logoPath) {
              logoMap.set(`${item.type}-${item.externalId}`, logoPath);
            }
          } catch (err) {
            console.warn(`[fetchLogos] Failed to fetch logo for ${item.type}/${item.externalId}:`, err);
          }
        }),
      );
    }
  }

  // 4. Upsert media records and store language-specific logos
  for (const item of needsFetch) {
    const key = `${item.provider}-${item.type}-${item.externalId}`;
    const enLogo = logoMap.get(`${item.type}-${item.externalId}`) ?? null;

    // Prefer the user's language logo when available so the card immediately
    // renders the translated version instead of waiting for the next page
    // load. TMDB tags images with iso_639_1 only ("pt"), so we resolve each
    // tag onto the supported regional locale via `resolveSupportedLocale` —
    // matches `upsertLangLogos`. When the prefix is ambiguous (e.g. both
    // `pt-BR` and `pt-PT` are supported), the resolver returns null and we
    // fall through to the English logo at read time.
    const langLogos = langLogoMap.get(`${item.type}-${item.externalId}`);
    let langLogo: string | null = null;
    if (useLangJoin && langLogos && supported) {
      for (const [tmdbCode, path] of langLogos) {
        if (resolveSupportedLocale(tmdbCode, supported) === language) {
          langLogo = path;
          break;
        }
      }
    }
    const logo = langLogo ?? enLogo;
    result[key] = logo;

    const existing = existingByKey.get(`${item.type}-${item.externalId}`);
    let mediaId: string | undefined;

    if (existing) {
      mediaId = existing.id;
      if (logo && !existing.logoPath) {
        // After Phase 1C-δ, logoPath lives only on media_localization.
        await upsertMediaLocalization(
          db,
          existing.id,
          "en-US",
          { title: item.title, posterPath: item.posterPath ?? null, logoPath: logo },
          "tmdb",
        );
      }
    } else {
      try {
        const [row] = await db.insert(media).values({
          type: item.type,
          externalId: item.externalId,
          provider: item.provider,
          backdropPath: item.backdropPath ?? null,
          year: item.year ?? null,
          voteAverage: item.voteAverage ?? null,
          downloaded: false,
        }).onConflictDoNothing({
          target: [media.externalId, media.provider, media.type],
        }).returning({ id: media.id });

        // onConflictDoNothing returns no row when the conflict fires; look it up.
        if (row?.id) {
          mediaId = row.id;
        } else {
          const conflict = await db.query.media.findFirst({
            where: and(
              eq(media.externalId, item.externalId),
              eq(media.provider, item.provider),
              eq(media.type, item.type),
            ),
            columns: { id: true },
          });
          mediaId = conflict?.id;
        }

        if (mediaId) {
          // After Phase 1C-δ, title/posterPath/logoPath live only on
          // media_localization en-US.
          await upsertMediaLocalization(
            db,
            mediaId,
            "en-US",
            { title: item.title, posterPath: item.posterPath ?? null, logoPath: logo },
            "tmdb",
          );
          // Browse-time stub — enqueue metadata fetch so filtered reads pick it
          // up once enriched.
          void dispatchEnsureMedia(mediaId).catch(
            deps.logger.logAndSwallow("fetch-logos dispatchEnsureMedia"),
          );
        }
      } catch (err) {
        console.warn(`[fetchLogos] Failed to upsert media ${item.type}/${item.externalId}:`, err);
      }
    }

    // Language-specific logos go through the shared helper so ensureMedia
    // and this browse-time path use identical write semantics. Reuses the
    // hoisted `supported` set above; falls back to an explicit fetch when
    // we got here without `useLangJoin` (e.g. an `en-US` caller still wants
    // future pt-BR readers to find logos persisted from this browse).
    if (mediaId && langLogos && langLogos.size > 0) {
      const supportedForWrite = supported ?? (await getActiveUserLanguages(db));
      await upsertLangLogos(db, mediaId, langLogos, supportedForWrite);
    }
  }

  return result;
}

/**
 * Enrich browse results with logos from DB.
 * Prefers translated logo for the given language, falls back to base English logo.
 *
 * Wave 9C2: routes the localization JOIN through
 * `MediaLocalizationRepositoryPort.findLogoOverlayByExternalRefs` and filters
 * to non-null logos client-side (volume per page is small enough that the
 * SQL-side filter no longer matters).
 */
export async function enrichBrowseWithLogos<
  T extends { results: SearchResult[]; totalPages: number; totalResults: number },
>(db: Database, data: T, language?: string): Promise<T> {
  if (data.results.length === 0) return data;

  const useLangJoin = !!language && !language.startsWith("en");
  const localization = makeMediaLocalizationRepository(db);

  const refs = data.results.map((r) => ({
    externalId: r.externalId,
    provider: r.provider,
    type: r.type,
  }));
  const rows = await localization.findLogoOverlayByExternalRefs(
    refs,
    useLangJoin ? language : "en-US",
  );

  const logoMap = new Map<string, string>();
  for (const r of rows) {
    if (r.logoPath) logoMap.set(`${r.type}-${r.externalId}`, r.logoPath);
  }

  if (logoMap.size === 0) return data;

  return {
    ...data,
    results: data.results.map((r) => {
      const logo = logoMap.get(`${r.type}-${r.externalId}`);
      return logo ? { ...r, logoPath: logo } : r;
    }),
  };
}
