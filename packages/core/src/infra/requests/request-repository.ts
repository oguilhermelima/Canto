import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { downloadRequest } from "@canto/db/schema";
import { findMediaLocalizedMany } from "../media/media-localized-repository";

/** Localization fields the request overlay adds back onto each media. */
type RequestMediaLocalization = {
  title: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  logoPath: string | null;
};

/**
 * Overlay `media_localization` (user lang COALESCEd with en-US) onto the
 * `media` field of each request row. After Phase 1C-δ the base media row no
 * longer carries title/overview/posterPath/logoPath — they live exclusively
 * on `media_localization`. The Drizzle relational query above returns the
 * raw media row; this helper batches a single localized lookup and merges
 * the localized fields into each request's `media` field.
 *
 * The generic constraint preserves the original shape of `media` (the FK is
 * `notNull` on `download_request.media_id` so callers can rely on it) — the
 * helper only injects the missing localization fields.
 */
async function overlayRequestMedia<
  T extends { media: { id: string } },
>(
  db: Database,
  rows: T[],
  language: string,
): Promise<Array<Omit<T, "media"> & { media: T["media"] & RequestMediaLocalization }>> {
  const ids = rows.map((r) => r.media.id);
  const localized = ids.length > 0
    ? await findMediaLocalizedMany(db, ids, language)
    : [];
  const byId = new Map(localized.map((l) => [l.id, l]));
  return rows.map((r) => {
    const loc = byId.get(r.media.id);
    const overlay: RequestMediaLocalization = {
      title: loc?.title ?? "",
      overview: loc?.overview ?? null,
      tagline: loc?.tagline ?? null,
      posterPath: loc?.posterPath ?? null,
      logoPath: loc?.logoPath ?? null,
    };
    return {
      ...r,
      media: { ...r.media, ...overlay },
    } as Omit<T, "media"> & { media: T["media"] & RequestMediaLocalization };
  });
}

export async function createDownloadRequest(
  db: Database,
  data: typeof downloadRequest.$inferInsert,
) {
  const [row] = await db
    .insert(downloadRequest)
    .values(data)
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function findRequestsByUser(
  db: Database,
  userId: string,
  language: string,
  status?: string,
) {
  const rows = await db.query.downloadRequest.findMany({
    where: status
      ? and(eq(downloadRequest.userId, userId), eq(downloadRequest.status, status))
      : eq(downloadRequest.userId, userId),
    with: { media: true },
    orderBy: [desc(downloadRequest.createdAt)],
  });
  return overlayRequestMedia(db, rows, language);
}

export async function findRequestsByUserPaginated(
  db: Database,
  userId: string,
  language: string,
  opts: { limit: number; offset: number },
): Promise<{ items: Awaited<ReturnType<typeof findRequestsByUser>>; total: number }> {
  const where = eq(downloadRequest.userId, userId);
  const [rows, [total]] = await Promise.all([
    db.query.downloadRequest.findMany({
      where,
      with: { media: true },
      orderBy: [desc(downloadRequest.createdAt)],
      limit: opts.limit,
      offset: opts.offset,
    }),
    db.select({ count: count() }).from(downloadRequest).where(where),
  ]);
  const items = await overlayRequestMedia(db, rows, language);
  return { items, total: total?.count ?? 0 };
}

export async function findAllRequests(db: Database, language: string, status?: string) {
  const rows = await db.query.downloadRequest.findMany({
    where: status ? eq(downloadRequest.status, status) : undefined,
    with: { media: true, user: { columns: { id: true, name: true, email: true } } },
    orderBy: [desc(downloadRequest.createdAt)],
  });
  return overlayRequestMedia(db, rows, language);
}

export async function findAllRequestsPaginated(
  db: Database,
  language: string,
  opts: { limit: number; offset: number },
): Promise<{ items: Awaited<ReturnType<typeof findAllRequests>>; total: number }> {
  const [rows, [total]] = await Promise.all([
    db.query.downloadRequest.findMany({
      with: { media: true, user: { columns: { id: true, name: true, email: true } } },
      orderBy: [desc(downloadRequest.createdAt)],
      limit: opts.limit,
      offset: opts.offset,
    }),
    db.select({ count: count() }).from(downloadRequest),
  ]);
  const items = await overlayRequestMedia(db, rows, language);
  return { items, total: total?.count ?? 0 };
}

export async function findRequestById(db: Database, id: string, language: string) {
  const row = await db.query.downloadRequest.findFirst({
    where: eq(downloadRequest.id, id),
    with: { media: true },
  });
  if (!row) return row;
  const [overlaid] = await overlayRequestMedia(db, [row], language);
  return overlaid;
}

export async function resolveRequest(
  db: Database,
  id: string,
  data: {
    status: "approved" | "rejected";
    adminNote?: string;
    resolvedBy: string;
  },
) {
  const [row] = await db
    .update(downloadRequest)
    .set({
      status: data.status,
      adminNote: data.adminNote,
      resolvedBy: data.resolvedBy,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(downloadRequest.id, id), eq(downloadRequest.status, "pending")))
    .returning();
  return row;
}

export async function updateRequestStatus(
  db: Database,
  mediaId: string,
  status: string,
) {
  await db
    .update(downloadRequest)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(downloadRequest.mediaId, mediaId),
        eq(downloadRequest.status, "approved"),
      ),
    );
}

export async function revertRequestStatus(
  db: Database,
  mediaId: string,
  fromStatus: string,
  toStatus: string,
) {
  await db
    .update(downloadRequest)
    .set({ status: toStatus, updatedAt: new Date() })
    .where(
      and(
        eq(downloadRequest.mediaId, mediaId),
        eq(downloadRequest.status, fromStatus),
      ),
    );
}

export async function cancelRequest(db: Database, id: string, userId: string) {
  const [row] = await db
    .update(downloadRequest)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(downloadRequest.id, id),
        eq(downloadRequest.userId, userId),
        eq(downloadRequest.status, "pending"),
      ),
    )
    .returning();
  return row;
}
