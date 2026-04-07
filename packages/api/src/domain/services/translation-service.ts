import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  media,
  mediaTranslation,
  seasonTranslation,
  episodeTranslation,
} from "@canto/db/schema";

/**
 * Apply translation overlay to a media object.
 * If a translation exists for the given language, overlay title/overview/poster/logo.
 * Falls back to the original (English) fields.
 */
export async function applyMediaTranslation<T extends { id: string; title: string; overview?: string | null; tagline?: string | null; posterPath?: string | null; logoPath?: string | null }>(
  db: Database,
  mediaRow: T,
  language: string,
): Promise<T> {
  if (!language || language.startsWith("en")) return mediaRow;

  const translation = await db.query.mediaTranslation.findFirst({
    where: and(
      eq(mediaTranslation.mediaId, mediaRow.id),
      eq(mediaTranslation.language, language),
    ),
  });

  if (!translation) return mediaRow;

  return {
    ...mediaRow,
    title: translation.title ?? mediaRow.title,
    overview: translation.overview ?? mediaRow.overview,
    tagline: translation.tagline ?? mediaRow.tagline,
    posterPath: translation.posterPath ?? mediaRow.posterPath,
    logoPath: translation.logoPath ?? mediaRow.logoPath,
  };
}

/**
 * Apply translation overlays to seasons and episodes.
 * Uses batch queries instead of N+1.
 */
export async function applySeasonsTranslation(
  db: Database,
  seasons: Array<{
    id: string;
    number: number;
    name: string | null;
    overview: string | null;
    episodes: Array<{ id: string; number: number; title: string | null; overview: string | null }>;
  }>,
  language: string,
): Promise<typeof seasons> {
  if (!language || language.startsWith("en") || seasons.length === 0) return seasons;

  // Batch: all season translations in one query
  const seasonIds = seasons.map((s) => s.id);
  const sTransRows = await db.query.seasonTranslation.findMany({
    where: and(
      sql`${seasonTranslation.seasonId} IN (${sql.join(seasonIds.map((id) => sql`${id}`), sql`, `)})`,
      eq(seasonTranslation.language, language),
    ),
  });
  const sTransMap = new Map(sTransRows.map((t) => [t.seasonId, t]));

  // Batch: all episode translations in one query
  const episodeIds = seasons.flatMap((s) => s.episodes.map((e) => e.id));
  let eTransMap = new Map<string, typeof episodeTranslation.$inferSelect>();
  if (episodeIds.length > 0) {
    const eTransRows = await db.query.episodeTranslation.findMany({
      where: and(
        sql`${episodeTranslation.episodeId} IN (${sql.join(episodeIds.map((id) => sql`${id}`), sql`, `)})`,
        eq(episodeTranslation.language, language),
      ),
    });
    eTransMap = new Map(eTransRows.map((t) => [t.episodeId, t]));
  }

  // Apply overlays
  for (const s of seasons) {
    const sTrans = sTransMap.get(s.id);
    if (sTrans) {
      s.name = sTrans.name ?? s.name;
      s.overview = sTrans.overview ?? s.overview;
    }
    for (const ep of s.episodes) {
      const eTrans = eTransMap.get(ep.id);
      if (eTrans) {
        ep.title = eTrans.title ?? ep.title;
        ep.overview = eTrans.overview ?? ep.overview;
      }
    }
  }

  return seasons;
}

/**
 * Translate media items by overlaying per-language translations from media_translation.
 * Items without any translation are returned unchanged (English fallback).
 */
export async function translateMediaItems<T extends { externalId: number; provider: string; title: string; overview?: string | null; posterPath?: string | null; logoPath?: string | null }>(
  db: Database,
  items: T[],
  language: string,
): Promise<T[]> {
  if (!language || language.startsWith("en") || items.length === 0) return items;

  const pairs = items.map((i) => sql`(${i.externalId}, ${i.provider})`);
  const rows = await db
    .select({
      externalId: media.externalId,
      provider: media.provider,
      title: mediaTranslation.title,
      overview: mediaTranslation.overview,
      posterPath: mediaTranslation.posterPath,
      logoPath: mediaTranslation.logoPath,
    })
    .from(media)
    .innerJoin(
      mediaTranslation,
      and(
        eq(mediaTranslation.mediaId, media.id),
        eq(mediaTranslation.language, language),
      ),
    )
    .where(sql`(${media.externalId}, ${media.provider}) IN (${sql.join(pairs, sql`, `)})`);

  if (rows.length === 0) return items;

  const transByKey = new Map<string, { title: string | null; overview: string | null; posterPath: string | null; logoPath: string | null }>();
  for (const r of rows) {
    transByKey.set(`${r.provider}-${r.externalId}`, r);
  }

  return items.map((item) => {
    const trans = transByKey.get(`${item.provider}-${item.externalId}`);
    if (!trans) return item;
    return {
      ...item,
      title: trans.title ?? item.title,
      overview: trans.overview ?? item.overview,
      ...(trans.posterPath ? { posterPath: trans.posterPath } : {}),
      ...(trans.logoPath ? { logoPath: trans.logoPath } : {}),
    };
  });
}

/** Batch-fetch media translations for a list of media IDs */
export async function batchMediaTranslations(
  db: Database,
  mediaIds: string[],
  language: string,
): Promise<Map<string, typeof mediaTranslation.$inferSelect>> {
  if (!language || language.startsWith("en") || mediaIds.length === 0) return new Map();
  const rows = await db.query.mediaTranslation.findMany({
    where: and(
      sql`${mediaTranslation.mediaId} IN (${sql.join(mediaIds.map((id) => sql`${id}`), sql`, `)})`,
      eq(mediaTranslation.language, language),
    ),
  });
  return new Map(rows.map((r) => [r.mediaId, r]));
}
