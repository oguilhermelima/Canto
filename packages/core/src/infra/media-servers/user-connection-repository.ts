import { and, eq, isNotNull } from "drizzle-orm";
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
  provider: "plex" | "jellyfin" | "trakt",
) {
  return db.query.userConnection.findFirst({
    where: and(
      eq(userConnection.userId, userId),
      eq(userConnection.provider, provider),
    ),
  });
}

export async function findEnabledTraktConnections(
  db: Database,
  opts: { connectionId?: string } = {},
) {
  const conditions = [
    eq(userConnection.enabled, true),
    eq(userConnection.provider, "trakt"),
    isNotNull(userConnection.token),
  ];
  if (opts.connectionId) {
    conditions.push(eq(userConnection.id, opts.connectionId));
  }
  return db.query.userConnection.findMany({
    where: and(...conditions),
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

export async function markUserConnectionStale(
  db: Database,
  userConnectionId: string,
  reason: string,
): Promise<void> {
  await db
    .update(userConnection)
    .set({ staleReason: reason, updatedAt: new Date() })
    .where(eq(userConnection.id, userConnectionId));
}

export async function clearUserConnectionStale(
  db: Database,
  userConnectionId: string,
): Promise<void> {
  // Guarded by isNotNull so a healthy connection doesn't churn updatedAt
  // on every successful scan.
  await db
    .update(userConnection)
    .set({ staleReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(userConnection.id, userConnectionId),
        isNotNull(userConnection.staleReason),
      ),
    );
}
