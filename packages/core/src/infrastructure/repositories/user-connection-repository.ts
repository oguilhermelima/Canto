import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";

export async function findAllUserConnections(db: Database) {
  return db.query.userConnection.findMany({
    where: eq(userConnection.enabled, true),
  });
}

export async function findUserConnectionById(db: Database, id: string) {
  return db.query.userConnection.findFirst({
    where: eq(userConnection.id, id),
  });
}

export async function findUserConnectionsByUserId(db: Database, userId: string) {
  return db.query.userConnection.findMany({
    where: eq(userConnection.userId, userId),
  });
}

export async function findUserConnectionByProvider(
  db: Database,
  userId: string,
  provider: "plex" | "jellyfin",
) {
  return db.query.userConnection.findFirst({
    where: and(
      eq(userConnection.userId, userId),
      eq(userConnection.provider, provider),
    ),
  });
}

export async function createUserConnection(
  db: Database,
  data: typeof userConnection.$inferInsert,
) {
  const [created] = await db
    .insert(userConnection)
    .values(data)
    .returning();
  return created;
}

export async function updateUserConnection(
  db: Database,
  id: string,
  data: Partial<typeof userConnection.$inferInsert>,
) {
  const [updated] = await db
    .update(userConnection)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userConnection.id, id))
    .returning();
  return updated;
}

export async function deleteUserConnection(db: Database, id: string) {
  const [deleted] = await db
    .delete(userConnection)
    .where(eq(userConnection.id, id))
    .returning();
  return deleted;
}
