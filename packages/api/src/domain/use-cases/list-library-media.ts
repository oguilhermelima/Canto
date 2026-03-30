import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { media, mediaFile } from "@canto/db/schema";
import type { ListInput } from "@canto/validators";

type MediaRow = typeof media.$inferSelect;

function buildLibraryFilters(input: ListInput): SQL {
  const conditions: SQL[] = [eq(media.inLibrary, true)];

  if (input.type) conditions.push(eq(media.type, input.type));

  if (input.genre) {
    conditions.push(
      sql`${media.genres}::jsonb @> ${JSON.stringify([input.genre])}::jsonb`,
    );
  }

  if (input.status) conditions.push(eq(media.status, input.status));
  if (input.yearMin) conditions.push(gte(media.year, input.yearMin));
  if (input.yearMax) conditions.push(lte(media.year, input.yearMax));
  if (input.language) conditions.push(eq(media.originalLanguage, input.language));
  if (input.scoreMin) conditions.push(gte(media.voteAverage, input.scoreMin));
  if (input.runtimeMax) conditions.push(lte(media.runtime, input.runtimeMax));
  if (input.contentRating) conditions.push(eq(media.contentRating, input.contentRating));

  if (input.network) {
    conditions.push(
      sql`${media.networks}::jsonb @> ${JSON.stringify([input.network])}::jsonb`,
    );
  }

  if (input.provider) conditions.push(eq(media.provider, input.provider));
  if (input.search) conditions.push(ilike(media.title, `%${input.search}%`));

  if (input.downloaded !== undefined) {
    if (input.downloaded) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${mediaFile} WHERE ${mediaFile.mediaId} = ${media.id})`,
      );
    } else {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ${mediaFile} WHERE ${mediaFile.mediaId} = ${media.id})`,
      );
    }
  }

  return and(...conditions)!;
}

function buildOrderBy(sortBy: ListInput["sortBy"], sortOrder: ListInput["sortOrder"]) {
  const orderFn = sortOrder === "asc" ? asc : desc;
  switch (sortBy) {
    case "title": return [orderFn(media.title)];
    case "year": return [orderFn(media.year)];
    case "voteAverage": return [orderFn(media.voteAverage)];
    case "popularity": return [orderFn(media.popularity)];
    case "releaseDate": return [orderFn(media.releaseDate)];
    case "addedAt":
    default: return [orderFn(media.addedAt)];
  }
}

export async function listLibraryMedia(
  db: Database,
  input: ListInput,
): Promise<{ items: MediaRow[]; total: number; page: number; pageSize: number }> {
  const page = input.page;
  const pageSize = input.pageSize;
  const offset = (page - 1) * pageSize;

  const where = buildLibraryFilters(input);
  const orderBy = buildOrderBy(input.sortBy, input.sortOrder);

  const [items, [totalRow]] = await Promise.all([
    db.query.media.findMany({ where, orderBy, limit: pageSize, offset }),
    db.select({ total: count() }).from(media).where(where),
  ]);

  return { items, total: totalRow?.total ?? 0, page, pageSize };
}
