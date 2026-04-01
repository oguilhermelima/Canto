import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { downloadRequest } from "@canto/db/schema";

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

export async function findRequestsByUser(db: Database, userId: string, status?: string) {
  return db.query.downloadRequest.findMany({
    where: status
      ? and(eq(downloadRequest.userId, userId), eq(downloadRequest.status, status))
      : eq(downloadRequest.userId, userId),
    with: { media: true },
    orderBy: [desc(downloadRequest.createdAt)],
  });
}

export async function findAllRequests(db: Database, status?: string) {
  return db.query.downloadRequest.findMany({
    where: status ? eq(downloadRequest.status, status) : undefined,
    with: { media: true, user: { columns: { id: true, name: true, email: true } } },
    orderBy: [desc(downloadRequest.createdAt)],
  });
}

export async function findRequestById(db: Database, id: string) {
  return db.query.downloadRequest.findFirst({
    where: eq(downloadRequest.id, id),
    with: { media: true },
  });
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
