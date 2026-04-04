import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaFile } from "@canto/db/schema";

export async function findMediaFilesByTorrentId(db: Database, torrentId: string, status?: string) {
  if (status) {
    return db.query.mediaFile.findMany({
      where: and(eq(mediaFile.torrentId, torrentId), eq(mediaFile.status, status)),
    });
  }
  return db.query.mediaFile.findMany({
    where: eq(mediaFile.torrentId, torrentId),
  });
}

export async function findMediaFilesByMediaId(db: Database, mediaId: string) {
  return db.query.mediaFile.findMany({
    where: eq(mediaFile.mediaId, mediaId),
    with: {
      episode: {
        columns: { id: true, number: true, title: true, seasonId: true },
        with: {
          season: { columns: { id: true, number: true } },
        },
      },
      torrent: {
        columns: { id: true, quality: true, source: true, title: true },
      },
    },
    orderBy: (f, { asc }) => [asc(f.createdAt)],
  });
}

export async function findDuplicateMovieFile(
  db: Database,
  mediaId: string,
  quality: string,
  source: string,
) {
  return db.query.mediaFile.findFirst({
    where: and(
      eq(mediaFile.mediaId, mediaId),
      eq(mediaFile.quality, quality),
      eq(mediaFile.source, source),
      isNull(mediaFile.episodeId),
    ),
  });
}

export async function findDuplicateEpisodeFile(
  db: Database,
  episodeId: string,
  quality: string,
  source: string,
) {
  return db.query.mediaFile.findFirst({
    where: and(
      eq(mediaFile.episodeId, episodeId),
      eq(mediaFile.quality, quality),
      eq(mediaFile.source, source),
    ),
  });
}

export async function createMediaFile(
  db: Database,
  data: typeof mediaFile.$inferInsert,
) {
  const [row] = await db.insert(mediaFile).values(data).returning();
  return row;
}

export async function updateMediaFile(
  db: Database,
  id: string,
  data: Partial<typeof mediaFile.$inferInsert>,
) {
  const [updated] = await db
    .update(mediaFile)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mediaFile.id, id))
    .returning();
  return updated;
}

export async function deleteMediaFile(db: Database, id: string) {
  await db.delete(mediaFile).where(eq(mediaFile.id, id));
}

export async function deleteMediaFilesByTorrentId(db: Database, torrentId: string) {
  await db.delete(mediaFile).where(eq(mediaFile.torrentId, torrentId));
}

export async function createMediaFileNoConflict(
  db: Database,
  data: typeof mediaFile.$inferInsert,
) {
  await db.insert(mediaFile).values(data).onConflictDoNothing();
}

export async function findAllMediaFiles(db: Database, status?: string) {
  if (status) {
    return db.query.mediaFile.findMany({
      where: eq(mediaFile.status, status),
    });
  }
  return db.query.mediaFile.findMany();
}
