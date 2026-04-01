import type { Database } from "@canto/db/client";
import { and, eq } from "drizzle-orm";
import { recommendationPool } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { getTvdbProvider } from "../../lib/tvdb-client";

export async function replacePoolShowsTvdb(
  db: Database,
  sourceMediaId: string,
): Promise<void> {
  const tvdbDefault =
    (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;
  if (!tvdbDefault) return;

  // Get show pool items from TMDB for this source
  const showItems = await db.query.recommendationPool.findMany({
    where: and(
      eq(recommendationPool.sourceMediaId, sourceMediaId),
      eq(recommendationPool.mediaType, "show"),
      eq(recommendationPool.provider, "tmdb"),
    ),
  });

  if (showItems.length === 0) return;

  const tvdb = await getTvdbProvider();
  let replaced = 0;

  // Process in batches of 20 with 1s delay between batches
  for (let i = 0; i < showItems.length; i += 20) {
    const batch = showItems.slice(i, i + 20);

    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const results = await tvdb.search(item.title, "show");
          if (results.results.length === 0) return;

          const match = results.results[0]!;
          await db
            .update(recommendationPool)
            .set({
              title: match.title,
              overview: match.overview ?? item.overview,
              posterPath: item.posterPath ?? match.posterPath, // Prefer existing TMDB poster
              backdropPath: item.backdropPath, // Keep existing TMDB backdrop
              provider: "tvdb",
              externalId: match.externalId,
              updatedAt: new Date(),
            })
            .where(eq(recommendationPool.id, item.id));
          replaced++;
        } catch {
          // Best-effort, skip failures
        }
      }),
    );

    // Rate limit: wait 1s between batches
    if (i + 20 < showItems.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (replaced > 0) {
    console.log(
      `[replace-pool-tvdb] Replaced ${replaced}/${showItems.length} show items for source ${sourceMediaId}`,
    );
  }
}
