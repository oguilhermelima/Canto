import { eq, and, sql, isNotNull, or } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { media, mediaTranslation } from "@canto/db/schema";
import { getActiveUserLanguages } from "../../services/user-service";
import type { MediaProviderPort } from "../../ports/media-provider.port";
import type { SearchResult } from "@canto/providers";
import { upsertLangLogos } from "../upsert-lang-logos";
import { dispatchMediaPipeline } from "../../../infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "../../../lib/log-error";

/** Deduplicates concurrent getImages calls for the same externalId */
const inflightFetches = new Map<string, Promise<string | undefined>>();

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
  tmdb: MediaProviderPort,
  items: FetchLogoItem[],
  language?: string,
): Promise<Record<string, string | null>> {
  if (items.length === 0) return {};

  const result: Record<string, string | null> = {};
  const useLangJoin = !!language && !language.startsWith("en");

  // 1. Query DB for existing records (match by externalId+provider+type triples).
  // When the user has a non-English language, also pull `media_translation.logoPath`
  // so the translated logo wins via COALESCE.
  const conditions = items.map((i) =>
    and(eq(media.externalId, i.externalId), eq(media.provider, i.provider), eq(media.type, i.type)),
  );

  const existingRows = useLangJoin
    ? await db
        .select({
          id: media.id,
          externalId: media.externalId,
          type: media.type,
          logoPath: sql<string | null>`COALESCE(${mediaTranslation.logoPath}, ${media.logoPath})`,
          translatedLogoPath: mediaTranslation.logoPath,
        })
        .from(media)
        .leftJoin(
          mediaTranslation,
          and(
            eq(mediaTranslation.mediaId, media.id),
            eq(mediaTranslation.language, language!),
          ),
        )
        .where(or(...conditions)!)
    : (
        await db.query.media.findMany({
          where: or(...conditions),
          columns: { id: true, externalId: true, type: true, logoPath: true },
        })
      ).map((r) => ({ ...r, translatedLogoPath: null as string | null }));

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
    // renders the translated version instead of waiting for the next page load.
    const langLogos = langLogoMap.get(`${item.type}-${item.externalId}`);
    const langPrefix = language?.split("-")[0];
    const langLogo = useLangJoin && langLogos
      ? langLogos.get(language!) ?? (langPrefix ? langLogos.get(langPrefix) : undefined) ?? null
      : null;
    const logo = langLogo ?? enLogo;
    result[key] = logo;

    const existing = existingByKey.get(`${item.type}-${item.externalId}`);
    let mediaId: string | undefined;

    if (existing) {
      mediaId = existing.id;
      if (logo && !existing.logoPath) {
        await db.update(media).set({ logoPath: logo }).where(eq(media.id, existing.id));
      }
    } else {
      try {
        const [row] = await db.insert(media).values({
          type: item.type,
          externalId: item.externalId,
          provider: item.provider,
          title: item.title,
          posterPath: item.posterPath ?? null,
          backdropPath: item.backdropPath ?? null,
          logoPath: logo,
          year: item.year ?? null,
          voteAverage: item.voteAverage ?? null,
          downloaded: false,
        }).onConflictDoUpdate({
          target: [media.externalId, media.provider, media.type],
          set: {
            logoPath: sql`CASE WHEN EXCLUDED.logo_path IS NOT NULL THEN EXCLUDED.logo_path ELSE ${media.logoPath} END`,
          },
        }).returning({ id: media.id });
        mediaId = row?.id;
        if (mediaId) {
          // Browse-time stub — enqueue metadata fetch so filtered reads pick it
          // up once enriched.
          void dispatchMediaPipeline({ mediaId }).catch(
            logAndSwallow("fetch-logos dispatchMediaPipeline"),
          );
        }
      } catch (err) {
        console.warn(`[fetchLogos] Failed to upsert media ${item.type}/${item.externalId}:`, err);
      }
    }

    // Language-specific logos go through the shared helper so ensureMedia
    // and this browse-time path use identical write semantics.
    if (mediaId && langLogos && langLogos.size > 0) {
      const supported = await getActiveUserLanguages(db);
      await upsertLangLogos(db, mediaId, langLogos, supported);
    }
  }

  return result;
}

/**
 * Enrich browse results with logos from DB.
 * Prefers translated logo for the given language, falls back to base English logo.
 */
export async function enrichBrowseWithLogos<
  T extends { results: SearchResult[]; totalPages: number; totalResults: number },
>(db: Database, data: T, language?: string): Promise<T> {
  if (data.results.length === 0) return data;

  const providers = [...new Set(data.results.map((r) => r.provider))];
  const externalIds = data.results.map((r) => r.externalId);
  const langPrefix = language?.split("-")[0];
  const useLangJoin = langPrefix && !language?.startsWith("en");

  const rows = await db
    .select({
      externalId: media.externalId,
      type: media.type,
      logoPath: media.logoPath,
      translatedLogoPath: useLangJoin ? mediaTranslation.logoPath : sql<string | null>`NULL`,
    })
    .from(media)
    .leftJoin(
      mediaTranslation,
      useLangJoin
        ? and(
            eq(mediaTranslation.mediaId, media.id),
            or(
              eq(mediaTranslation.language, language!),
              sql`LEFT(${mediaTranslation.language}, 2) = ${langPrefix}`,
            ),
          )
        : sql`FALSE`,
    )
    .where(
      and(
        sql`${media.externalId} IN (${sql.join(externalIds.map((id) => sql`${id}`), sql`, `)})`,
        sql`${media.provider} IN (${sql.join(providers.map((p) => sql`${p}`), sql`, `)})`,
        or(isNotNull(media.logoPath), isNotNull(mediaTranslation.logoPath)),
      ),
    );

  if (rows.length === 0) return data;

  const logoMap = new Map(
    rows.map((r) => [`${r.type}-${r.externalId}`, r.translatedLogoPath ?? r.logoPath]),
  );

  return {
    ...data,
    results: data.results.map((r) => {
      const logo = logoMap.get(`${r.type}-${r.externalId}`);
      return logo ? { ...r, logoPath: logo } : r;
    }),
  };
}
