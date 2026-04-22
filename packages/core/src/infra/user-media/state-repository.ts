import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userMediaState } from "@canto/db/schema";

export async function findUserMediaState(db: Database, userId: string, mediaId: string) {
  return db.query.userMediaState.findFirst({
    where: and(eq(userMediaState.userId, userId), eq(userMediaState.mediaId, mediaId)),
  });
}

export async function upsertUserMediaState(
  db: Database,
  data: typeof userMediaState.$inferInsert,
) {
  const [upserted] = await db
    .insert(userMediaState)
    .values(data)
    .onConflictDoUpdate({
      target: [userMediaState.userId, userMediaState.mediaId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return upserted;
}

export interface UserMediaStateByMediaRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  updatedAt: Date;
}

export async function findUserMediaStatesByMediaIds(
  db: Database,
  userId: string,
  mediaIds: string[],
): Promise<UserMediaStateByMediaRow[]> {
  if (mediaIds.length === 0) return [];

  return db
    .select({
      mediaId: userMediaState.mediaId,
      status: userMediaState.status,
      rating: userMediaState.rating,
      updatedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .where(
      and(
        eq(userMediaState.userId, userId),
        inArray(userMediaState.mediaId, mediaIds),
      ),
    );
}
