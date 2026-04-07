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
import {
  media,
  mediaFile,
} from "@canto/db/schema";
import type { ListInput } from "@canto/validators";

type MediaRow = typeof media.$inferSelect;

const withSeasonsAndEpisodes = {
  seasons: {
    orderBy: (s: any, { asc }: any) => [asc(s.number)],
    with: {
      episodes: {
        orderBy: (e: any, { asc }: any) => [asc(e.number)],
      },
    },
  },
} as const;

export async function findMediaById(db: Database, id: string) {
  return db.query.media.findFirst({
    where: eq(media.id, id),
  });
}

export async function findMediaByIdWithSeasons(db: Database, id: string) {
  return db.query.media.findFirst({
    where: eq(media.id, id),
    with: withSeasonsAndEpisodes,
  });
}

export async function findMediaByExternalId(
  db: Database,
  externalId: number,
  provider: string,
) {
  return db.query.media.findFirst({
    where: and(eq(media.externalId, externalId), eq(media.provider, provider)),
    with: withSeasonsAndEpisodes,
  });
}

/**
 * Find a media record by any cross-reference: externalId+provider, IMDB ID, or TVDB ID.
 * Prevents duplicates when a show has been replaced from TMDB→TVDB (or vice versa).
 * Returns the record with seasons if found by any reference.
 */
export async function findMediaByAnyReference(
  db: Database,
  externalId: number,
  provider: string,
  imdbId?: string,
  tvdbId?: number,
) {
  // 1. Direct match by externalId + provider
  const direct = await db.query.media.findFirst({
    where: and(eq(media.externalId, externalId), eq(media.provider, provider)),
    with: withSeasonsAndEpisodes,
  });
  if (direct) return direct;

  // 2. Cross-reference by IMDB ID (most reliable for cross-provider matching)
  if (imdbId) {
    const byImdb = await db.query.media.findFirst({
      where: eq(media.imdbId, imdbId),
      with: withSeasonsAndEpisodes,
    });
    if (byImdb) return byImdb;
  }

  // 3. Cross-reference by TVDB ID
  if (tvdbId) {
    const byTvdb = await db.query.media.findFirst({
      where: eq(media.tvdbId, tvdbId),
      with: withSeasonsAndEpisodes,
    });
    if (byTvdb) return byTvdb;
  }

  // 4. If provider is TVDB, check if TMDB has this tvdbId stored
  if (provider === "tvdb") {
    const byTvdbRef = await db.query.media.findFirst({
      where: eq(media.tvdbId, externalId),
      with: withSeasonsAndEpisodes,
    });
    if (byTvdbRef) return byTvdbRef;
  }

  // 5. If provider is TMDB, check if a TVDB record has this as tvdbId cross-ref
  if (provider === "tmdb") {
    const byTmdbRef = await db.query.media.findFirst({
      where: and(eq(media.provider, "tvdb"), eq(media.tvdbId, externalId)),
      with: withSeasonsAndEpisodes,
    });
    if (byTmdbRef) return byTmdbRef;
  }

  return null;
}

export async function updateMedia(
  db: Database,
  id: string,
  data: Partial<typeof media.$inferInsert>,
) {
  const [updated] = await db
    .update(media)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(media.id, id))
    .returning();
  return updated;
}

export async function deleteMedia(db: Database, id: string) {
  const [deleted] = await db.delete(media).where(eq(media.id, id)).returning();
  return deleted;
}

export async function findLibraryExternalIds(db: Database) {
  return db.query.media.findMany({
    where: eq(media.inLibrary, true),
    columns: { externalId: true, provider: true },
  });
}

export async function findLibraryMediaBrief(db: Database, limit = 100) {
  return db.query.media.findMany({
    where: eq(media.inLibrary, true),
    columns: { id: true, externalId: true, provider: true, type: true },
    limit,
  });
}

export async function findLibraryStats(db: Database) {
  const [totalRow] = await db
    .select({ total: count() })
    .from(media)
    .where(eq(media.inLibrary, true));

  const [moviesRow] = await db
    .select({ total: count() })
    .from(media)
    .where(and(eq(media.inLibrary, true), eq(media.type, "movie")));

  const [showsRow] = await db
    .select({ total: count() })
    .from(media)
    .where(and(eq(media.inLibrary, true), eq(media.type, "show")));

  const [storageRow] = await db
    .select({ totalBytes: sql<string>`COALESCE(SUM(${mediaFile.sizeBytes}), 0)` })
    .from(mediaFile);

  return {
    total: totalRow?.total ?? 0,
    movies: moviesRow?.total ?? 0,
    shows: showsRow?.total ?? 0,
    storageBytes: BigInt(storageRow?.totalBytes ?? "0"),
  };
}

/* -------------------------------------------------------------------------- */
/*  Library listing (paginated + filtered)                                    */
/* -------------------------------------------------------------------------- */

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
        sql`EXISTS (SELECT 1 FROM media_file WHERE media_file.media_id = ${media.id})`,
      );
    } else {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM media_file WHERE media_file.media_id = ${media.id})`,
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
  const page = input.cursor ?? input.page;
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
