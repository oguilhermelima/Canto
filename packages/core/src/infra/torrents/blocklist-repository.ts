import { and, eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { blocklist } from "@canto/db/schema";

/**
 * Wave 9C2: blocklist queries moved from `infra/content-enrichment/extras-repository`
 * into the torrents infra namespace. The only consumer is the
 * {@link makeTorrentsRepository} adapter — domain code goes through the
 * `TorrentsRepositoryPort` blocklist methods.
 */
export async function findBlocklistByMediaId(db: Database, mediaId: string) {
  return db.query.blocklist.findMany({
    where: eq(blocklist.mediaId, mediaId),
    columns: { title: true },
  });
}

export async function findBlocklistEntry(
  db: Database,
  mediaId: string,
  title: string,
) {
  return db.query.blocklist.findFirst({
    where: and(eq(blocklist.mediaId, mediaId), eq(blocklist.title, title)),
  });
}

export async function createBlocklistEntry(
  db: Database,
  data: typeof blocklist.$inferInsert,
) {
  const [row] = await db.insert(blocklist).values(data).returning();
  return row;
}
