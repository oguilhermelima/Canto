import { eq, and, sql, isNotNull, or } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { media } from "@canto/db/schema";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { SearchResult } from "@canto/providers";

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
 * 1. Check DB for existing media records with logoPath
 * 2. For items without logos, batch-fetch from TMDB getImages()
 * 3. Upsert minimal media records with the fetched logos
 *
 * Returns a map of "provider-externalId" → logoPath (or null if no logo).
 */
export async function fetchLogos(
  db: Database,
  tmdb: MediaProviderPort,
  items: FetchLogoItem[],
): Promise<Record<string, string | null>> {
  if (items.length === 0) return {};

  const result: Record<string, string | null> = {};

  // 1. Query DB for existing records (match by externalId+provider pairs)
  const conditions = items.map((i) =>
    and(eq(media.externalId, i.externalId), eq(media.provider, i.provider)),
  );
  const existingRows = await db.query.media.findMany({
    where: or(...conditions),
    columns: { id: true, externalId: true, logoPath: true },
  });

  const existingByExtId = new Map(existingRows.map((r) => [r.externalId, r]));

  // 2. Classify items
  const needsFetch: FetchLogoItem[] = [];
  for (const item of items) {
    const key = `${item.provider}-${item.externalId}`;
    const existing = existingByExtId.get(item.externalId);
    if (existing?.logoPath) {
      result[key] = existing.logoPath;
    } else {
      needsFetch.push(item);
    }
  }

  if (needsFetch.length === 0) return result;

  // 3. Batch fetch logos from TMDB (groups of 10)
  const logoMap = new Map<number, string>();

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
                const enLogos = (images.logos ?? []).filter(
                  (l) => l.iso_639_1 === "en" || l.iso_639_1 === null,
                );
                return enLogos.length > 0 ? enLogos[0]!.file_path : undefined;
              })();
              inflightFetches.set(cacheKey, existing);
            }
            const logoPath = await existing;
            inflightFetches.delete(cacheKey);
            if (logoPath) {
              logoMap.set(item.externalId, logoPath);
            }
          } catch (err) {
            console.warn(`[fetchLogos] Failed to fetch logo for ${item.type}/${item.externalId}:`, err);
          }
        }),
      );
    }
  }

  // 4. Upsert media records
  for (const item of needsFetch) {
    const key = `${item.provider}-${item.externalId}`;
    const logo = logoMap.get(item.externalId) ?? null;
    result[key] = logo;

    const existing = existingByExtId.get(item.externalId);
    if (existing) {
      // Update logo if we fetched one and existing doesn't have it
      if (logo && !existing.logoPath) {
        await db.update(media).set({ logoPath: logo }).where(eq(media.id, existing.id));
      }
    } else {
      // Create minimal media record
      try {
        await db.insert(media).values({
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
          processingStatus: "pending",
        }).onConflictDoUpdate({
          target: [media.externalId, media.provider],
          set: {
            logoPath: sql`CASE WHEN EXCLUDED.logo_path IS NOT NULL THEN EXCLUDED.logo_path ELSE ${media.logoPath} END`,
          },
        });
      } catch (err) {
        console.warn(`[fetchLogos] Failed to upsert media ${item.type}/${item.externalId}:`, err);
      }
    }
  }

  return result;
}

/**
 * Enrich browse results with logos from DB.
 * Single SELECT query — fast. Only adds logoPath to items that have logos persisted.
 */
export async function enrichBrowseWithLogos<
  T extends { results: SearchResult[]; totalPages: number; totalResults: number },
>(db: Database, data: T): Promise<T> {
  if (data.results.length === 0) return data;

  const providers = [...new Set(data.results.map((r) => r.provider))];
  const externalIds = data.results.map((r) => r.externalId);
  const rows = await db
    .select({ externalId: media.externalId, logoPath: media.logoPath })
    .from(media)
    .where(
      and(
        sql`${media.externalId} IN (${sql.join(externalIds.map((id) => sql`${id}`), sql`, `)})`,
        sql`${media.provider} IN (${sql.join(providers.map((p) => sql`${p}`), sql`, `)})`,
        isNotNull(media.logoPath),
      ),
    );

  if (rows.length === 0) return data;

  const logoMap = new Map(rows.map((r) => [r.externalId, r.logoPath]));

  return {
    ...data,
    results: data.results.map((r) => {
      const logo = logoMap.get(r.externalId);
      return logo ? { ...r, logoPath: logo } : r;
    }),
  };
}
