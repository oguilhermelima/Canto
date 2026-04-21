import { eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { homeSection } from "@canto/db/schema";
import type { HomeSectionConfig } from "@canto/db/schema";

export async function findHomeSections(db: Database, userId: string) {
  return db.query.homeSection.findMany({
    where: eq(homeSection.userId, userId),
    orderBy: (t, { asc }) => [asc(t.position)],
  });
}

export async function replaceHomeSections(
  db: Database,
  userId: string,
  sections: Array<{
    position: number;
    title: string;
    style: string;
    sourceType: string;
    sourceKey: string;
    config: HomeSectionConfig;
    enabled: boolean;
  }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(homeSection).where(eq(homeSection.userId, userId));
    if (sections.length > 0) {
      await tx.insert(homeSection).values(
        sections.map((s) => ({ ...s, userId })),
      );
    }
  });
}

export async function seedHomeSectionsForUser(
  db: Database,
  userId: string,
  defaults: Array<{
    position: number;
    title: string;
    style: string;
    sourceType: string;
    sourceKey: string;
    config: HomeSectionConfig;
    enabled: boolean;
  }>,
): Promise<void> {
  await db.insert(homeSection).values(
    defaults.map((s) => ({ ...s, userId })),
  );
}

export async function deleteHomeSections(
  db: Database,
  userId: string,
): Promise<void> {
  await db.delete(homeSection).where(eq(homeSection.userId, userId));
}
