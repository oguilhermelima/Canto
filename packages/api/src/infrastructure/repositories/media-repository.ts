import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, mediaFile, season } from "@canto/db/schema";

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
    columns: { externalId: true },
  });
}

export async function findLibraryMediaBrief(db: Database, limit = 100) {
  return db.query.media.findMany({
    where: eq(media.inLibrary, true),
    columns: { id: true, externalId: true, provider: true, type: true },
    limit,
  });
}

export async function getLibraryStats(db: Database) {
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
