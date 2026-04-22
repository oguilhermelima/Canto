import { eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { profileSection } from "@canto/db/schema";
import type { ProfileSectionConfig } from "@canto/db/schema";

export async function findProfileSections(db: Database, userId: string) {
  return db.query.profileSection.findMany({
    where: eq(profileSection.userId, userId),
    orderBy: (t, { asc }) => [asc(t.position)],
  });
}

export async function replaceProfileSections(
  db: Database,
  userId: string,
  sections: Array<{
    position: number;
    sectionKey: string;
    title: string;
    config: ProfileSectionConfig;
    enabled: boolean;
  }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(profileSection).where(eq(profileSection.userId, userId));
    if (sections.length > 0) {
      await tx.insert(profileSection).values(
        sections.map((s) => ({ ...s, userId })),
      );
    }
  });
}

export async function seedProfileSectionsForUser(
  db: Database,
  userId: string,
  defaults: Array<{
    position: number;
    sectionKey: string;
    title: string;
    config?: ProfileSectionConfig;
    enabled: boolean;
  }>,
): Promise<void> {
  await db.insert(profileSection).values(
    defaults.map((s) => ({ ...s, config: s.config ?? {}, userId })),
  );
}

export async function deleteProfileSections(
  db: Database,
  userId: string,
): Promise<void> {
  await db.delete(profileSection).where(eq(profileSection.userId, userId));
}
