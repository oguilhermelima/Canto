import { and, eq, inArray, or, sql } from "drizzle-orm";
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

export interface UserEngagementStateRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: Date;
}


/**
 * All non-neutral states for a user: anything with a status, rating, or
 * favorite flag set. Used by the recs rebuild to weight seeds by engagement
 * and to exclude dropped/disliked items from the output.
 */
export async function findUserEngagementStates(
  db: Database,
  userId: string,
): Promise<UserEngagementStateRow[]> {
  return db
    .select({
      mediaId: userMediaState.mediaId,
      status: userMediaState.status,
      rating: userMediaState.rating,
      isFavorite: userMediaState.isFavorite,
      updatedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .where(
      and(
        eq(userMediaState.userId, userId),
        or(
          sql`${userMediaState.status} IS NOT NULL`,
          sql`${userMediaState.rating} IS NOT NULL`,
          eq(userMediaState.isFavorite, true),
        ),
      ),
    );
}
