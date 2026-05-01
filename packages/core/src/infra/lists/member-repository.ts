import { and, eq, inArray, sql, count } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { list, listMember, listInvitation, user, userMediaState } from "@canto/db/schema";
import crypto from "crypto";

// ── Members ──

export async function findListMembers(db: Database, listId: string) {
  return db
    .select({
      id: listMember.id,
      userId: listMember.userId,
      role: listMember.role,
      createdAt: listMember.createdAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(listMember)
    .innerJoin(user, eq(listMember.userId, user.id))
    .where(eq(listMember.listId, listId));
}

export async function findListMember(
  db: Database,
  listId: string,
  userId: string,
) {
  return db.query.listMember.findFirst({
    where: and(eq(listMember.listId, listId), eq(listMember.userId, userId)),
  });
}

export async function addListMember(
  db: Database,
  data: { listId: string; userId: string; role: string },
) {
  const [row] = await db
    .insert(listMember)
    .values(data)
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function updateListMemberRole(
  db: Database,
  listId: string,
  userId: string,
  role: string,
) {
  const [row] = await db
    .update(listMember)
    .set({ role })
    .where(and(eq(listMember.listId, listId), eq(listMember.userId, userId)))
    .returning();
  return row;
}

export async function removeListMember(
  db: Database,
  listId: string,
  userId: string,
) {
  await db
    .delete(listMember)
    .where(and(eq(listMember.listId, listId), eq(listMember.userId, userId)));
}

/** Check if a user is a member (or owner) of any lists containing this media */
export async function findUserMembershipForList(
  db: Database,
  listId: string,
  userId: string,
): Promise<{ role: string } | undefined> {
  const row = await db.query.listMember.findFirst({
    where: and(eq(listMember.listId, listId), eq(listMember.userId, userId)),
    columns: { role: true },
  });
  return row ?? undefined;
}

// ── Invitations ──

export async function createInvitation(
  db: Database,
  data: {
    listId: string;
    invitedBy: string;
    invitedEmail?: string;
    invitedUserId?: string;
    role: string;
  },
) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [row] = await db
    .insert(listInvitation)
    .values({ ...data, token, expiresAt })
    .returning();
  if (!row) throw new Error("createInvitation: insert returned no row");
  return row;
}

export async function findInvitationByToken(db: Database, token: string) {
  return db.query.listInvitation.findFirst({
    where: eq(listInvitation.token, token),
  });
}

export async function acceptInvitation(db: Database, token: string) {
  const [row] = await db
    .update(listInvitation)
    .set({ status: "accepted" })
    .where(
      and(
        eq(listInvitation.token, token),
        eq(listInvitation.status, "pending"),
      ),
    )
    .returning();
  return row;
}

export async function findPendingInvitations(db: Database, listId: string) {
  return db
    .select({
      id: listInvitation.id,
      token: listInvitation.token,
      invitedEmail: listInvitation.invitedEmail,
      invitedUserId: listInvitation.invitedUserId,
      role: listInvitation.role,
      status: listInvitation.status,
      expiresAt: listInvitation.expiresAt,
      createdAt: listInvitation.createdAt,
    })
    .from(listInvitation)
    .where(
      and(
        eq(listInvitation.listId, listId),
        eq(listInvitation.status, "pending"),
      ),
    );
}

export async function deleteInvitation(db: Database, id: string) {
  await db.delete(listInvitation).where(eq(listInvitation.id, id));
}

// ── Vote Aggregation ──

/**
 * Get aggregated ratings from all members (and owner) for media items in a list.
 * Returns sum and count of ratings per mediaId.
 */
export async function getListMemberVotes(
  db: Database,
  listId: string,
  mediaIds: string[],
) {
  if (mediaIds.length === 0) return [];

  // Get all member userIds for this list
  const members = await db
    .select({ userId: listMember.userId })
    .from(listMember)
    .where(eq(listMember.listId, listId));

  // Also include the list owner
  const listRow = await db.query.list.findFirst({
    where: eq(list.id, listId),
    columns: { userId: true },
  });

  const memberUserIds = members.map((m) => m.userId);
  if (listRow?.userId) memberUserIds.push(listRow.userId);

  if (memberUserIds.length === 0) return [];

  const votes = await db
    .select({
      mediaId: userMediaState.mediaId,
      totalRating: sql<number>`COALESCE(SUM(${userMediaState.rating}), 0)`.as("total_rating"),
      voteCount: count().as("vote_count"),
    })
    .from(userMediaState)
    .where(
      and(
        inArray(userMediaState.mediaId, mediaIds),
        inArray(userMediaState.userId, memberUserIds),
        sql`${userMediaState.rating} IS NOT NULL`,
      ),
    )
    .groupBy(userMediaState.mediaId);

  return votes;
}
