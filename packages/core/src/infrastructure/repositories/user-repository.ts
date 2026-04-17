import { asc, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { user } from "@canto/db/schema";

export async function findAllUsers(db: Database) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.createdAt));
}

export async function getUserPreferences(db: Database, userId: string) {
  const [row] = await db
    .select({
      watchRegion: user.watchRegion,
      directSearchEnabled: user.directSearchEnabled,
      isPublic: user.isPublic,
    })
    .from(user)
    .where(eq(user.id, userId));
  return {
    watchRegion: row?.watchRegion ?? null,
    directSearchEnabled: row?.directSearchEnabled ?? true,
    isPublic: row?.isPublic ?? false,
  };
}

export async function setUserPreferences(
  db: Database,
  userId: string,
  input: {
    watchRegion?: string;
    directSearchEnabled?: boolean;
    isPublic?: boolean;
  },
) {
  const updates: Partial<{
    watchRegion: string;
    directSearchEnabled: boolean;
    isPublic: boolean;
  }> = {};
  if (input.watchRegion !== undefined) updates.watchRegion = input.watchRegion;
  if (input.directSearchEnabled !== undefined)
    updates.directSearchEnabled = input.directSearchEnabled;
  if (input.isPublic !== undefined) updates.isPublic = input.isPublic;

  if (Object.keys(updates).length === 0) return;

  await db.update(user).set(updates).where(eq(user.id, userId));
}

export async function getUserProfile(db: Database, userId: string) {
  const [row] = await db
    .select({ bio: user.bio, headerImage: user.headerImage })
    .from(user)
    .where(eq(user.id, userId));
  return {
    bio: row?.bio ?? null,
    headerImage: row?.headerImage ?? null,
  };
}

export async function updateUserProfile(
  db: Database,
  userId: string,
  input: { bio?: string | null; headerImage?: string | null },
) {
  const updates: Partial<{ bio: string | null; headerImage: string | null }> = {};
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.headerImage !== undefined) updates.headerImage = input.headerImage;

  if (Object.keys(updates).length === 0) return;

  await db.update(user).set(updates).where(eq(user.id, userId));
}
