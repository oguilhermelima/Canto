import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { library, userPreference } from "@canto/db/schema";

export async function findLibraryById(db: Database, id: string) {
  return db.query.library.findFirst({
    where: eq(library.id, id),
  });
}

export async function findDefaultLibrary(db: Database, type: string) {
  return db.query.library.findFirst({
    where: and(eq(library.type, type), eq(library.isDefault, true)),
  });
}

export async function findAllLibraries(db: Database) {
  return db.query.library.findMany({
    orderBy: (l, { asc: a }) => [a(l.type), a(l.name)],
  });
}

export async function findDefaultLibraries(db: Database) {
  return db.query.library.findMany({
    where: eq(library.isDefault, true),
  });
}

export async function updateLibrary(
  db: Database,
  id: string,
  data: Partial<typeof library.$inferInsert>,
) {
  const [updated] = await db
    .update(library)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(library.id, id))
    .returning();
  return updated;
}

export async function seedDefaultLibraries(db: Database) {
  const existing = await db.query.library.findMany();
  if (existing.length > 0) return existing;

  return db
    .insert(library)
    .values([
      { name: "Movies", type: "movies", jellyfinPath: "/media/Movies", qbitCategory: "movies", isDefault: true },
      { name: "Shows", type: "shows", jellyfinPath: "/media/Shows", qbitCategory: "shows", isDefault: true },
      { name: "Animes", type: "animes", jellyfinPath: "/media/Animes", qbitCategory: "animes", isDefault: true },
    ])
    .returning();
}

export async function setDefaultLibrary(db: Database, id: string, type: string) {
  await db
    .update(library)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(library.type, type));

  const [updated] = await db
    .update(library)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(library.id, id))
    .returning();
  return updated;
}

export async function getUserPreferences(db: Database, userId: string) {
  const rows = await db.query.userPreference.findMany({
    where: eq(userPreference.userId, userId),
  });
  const prefs: Record<string, unknown> = {};
  for (const row of rows) prefs[row.key] = row.value;
  return { autoMergeVersions: true, defaultQuality: "fullhd", ...prefs };
}

export async function setUserPreference(
  db: Database,
  userId: string,
  key: string,
  value: unknown,
) {
  await db
    .insert(userPreference)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [userPreference.userId, userPreference.key],
      set: { value },
    });
}
