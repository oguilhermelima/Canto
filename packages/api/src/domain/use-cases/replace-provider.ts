import type { Database } from "@canto/db/client";
import { eq } from "drizzle-orm";
import { media, season } from "@canto/db/schema";
import type { MediaType } from "@canto/providers";
import { getTmdbProvider } from "../../lib/tmdb-client";
import { getTvdbProvider } from "../../lib/tvdb-client";
import { updateMediaFromNormalized } from "@canto/db/persist-media";
import { dispatchRefreshExtras } from "../../infrastructure/queue/bullmq-dispatcher";
import { findMediaById } from "../../infrastructure/repositories";

export async function replaceMediaProvider(
  db: Database,
  mediaId: string,
  targetProvider: "tmdb" | "tvdb",
): Promise<typeof media.$inferSelect> {
  const row = await findMediaById(db, mediaId);
  if (!row) throw new Error("Media not found");
  if (row.provider === targetProvider) throw new Error(`Media is already using ${targetProvider}`);
  if (row.type === "movie" && targetProvider === "tvdb") throw new Error("TVDB does not support movies");

  const provider = targetProvider === "tmdb" ? await getTmdbProvider() : await getTvdbProvider();

  // Find equivalent on target provider
  let targetExternalId: number | null = null;

  // Try IMDB ID first (most reliable)
  if (row.imdbId && targetProvider === "tmdb") {
    try {
      const tmdb = await getTmdbProvider();
      const found = await tmdb.findByImdbId(row.imdbId);
      const match = found.find((r) => r.type === row.type);
      if (match) targetExternalId = match.externalId;
    } catch { /* fallback to search */ }
  }

  // Try title search
  if (!targetExternalId) {
    const searchResults = await provider.search(row.title, row.type as MediaType);
    if (searchResults.results.length > 0) {
      targetExternalId = searchResults.results[0]!.externalId;
    }
  }

  if (!targetExternalId) throw new Error(`Could not find "${row.title}" on ${targetProvider}`);

  // Fetch full metadata from target provider
  const normalized = await provider.getMetadata(targetExternalId, row.type as MediaType);

  // Delete existing seasons (cascade deletes episodes)
  await db.delete(season).where(eq(season.mediaId, mediaId));

  // Update media with new provider data
  const updated = await updateMediaFromNormalized(db, mediaId, normalized);

  // Dispatch refresh-extras to populate credits/similar/recommendations from TMDB
  void dispatchRefreshExtras(mediaId).catch(() => {});

  return updated;
}
