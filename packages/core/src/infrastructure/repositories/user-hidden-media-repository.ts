import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userHiddenMedia } from "@canto/db/schema";

export async function hideMedia(
  db: Database,
  data: {
    userId: string;
    externalId: number;
    provider: string;
    type: string;
    title: string;
    posterPath?: string | null;
  },
) {
  await db
    .insert(userHiddenMedia)
    .values({
      userId: data.userId,
      externalId: data.externalId,
      provider: data.provider,
      type: data.type,
      title: data.title,
      posterPath: data.posterPath,
    })
    .onConflictDoNothing();
}

export async function unhideMedia(
  db: Database,
  params: { userId: string; externalId: number; provider: string },
) {
  await db
    .delete(userHiddenMedia)
    .where(
      and(
        eq(userHiddenMedia.userId, params.userId),
        eq(userHiddenMedia.externalId, params.externalId),
        eq(userHiddenMedia.provider, params.provider),
      ),
    );
}

export async function findHiddenMediaPaginated(
  db: Database,
  userId: string,
  params: { limit: number; offset: number },
) {
  const [items, [countRow]] = await Promise.all([
    db
      .select()
      .from(userHiddenMedia)
      .where(eq(userHiddenMedia.userId, userId))
      .orderBy(desc(userHiddenMedia.createdAt))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ total: count() })
      .from(userHiddenMedia)
      .where(eq(userHiddenMedia.userId, userId)),
  ]);
  return { items, total: countRow?.total ?? 0 };
}

export async function findHiddenIds(db: Database, userId: string) {
  return db
    .select({
      externalId: userHiddenMedia.externalId,
      provider: userHiddenMedia.provider,
    })
    .from(userHiddenMedia)
    .where(eq(userHiddenMedia.userId, userId));
}
