import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaFile } from "@canto/db/schema";

export async function findMediaFilesByDownloadId(db: Database, downloadId: string, status?: string) {
  if (status) {
    return db.query.mediaFile.findMany({
      where: and(eq(mediaFile.downloadId, downloadId), eq(mediaFile.status, status)),
    });
  }
  return db.query.mediaFile.findMany({
    where: eq(mediaFile.downloadId, downloadId),
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
      download: {
        columns: { id: true, quality: true, source: true, title: true },
      },
    },
    orderBy: (f, { asc }) => [asc(f.createdAt)],
  });
}

// Dedup intentionally checks only `status='imported'` rows. Pending
// placeholders from cancelled/deleted downloads must not block a retry —
// otherwise a user who cancels or deletes a download cannot start a new
// one with the same quality/source until the orphaned row is purged.
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
      eq(mediaFile.status, "imported"),
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
      eq(mediaFile.status, "imported"),
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

export async function deleteMediaFilesByDownloadId(db: Database, downloadId: string) {
  await db.delete(mediaFile).where(eq(mediaFile.downloadId, downloadId));
}

/**
 * Delete media_file rows linked to a download that have NOT been imported
 * yet. Used when cancelling a download: the placeholder rows must go so a
 * retry isn't blocked, but any already-imported files (rare on cancel, but
 * possible if a partial import ran) are preserved as history.
 */
export async function deletePendingMediaFilesByDownloadId(db: Database, downloadId: string) {
  await db
    .delete(mediaFile)
    .where(and(eq(mediaFile.downloadId, downloadId), ne(mediaFile.status, "imported")));
}

export async function createMediaFileNoConflict(
  db: Database,
  data: typeof mediaFile.$inferInsert,
) {
  await db.insert(mediaFile).values(data).onConflictDoNothing();
}
