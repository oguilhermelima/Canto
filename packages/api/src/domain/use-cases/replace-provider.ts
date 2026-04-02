import type { Database } from "@canto/db/client";
import { eq } from "drizzle-orm";
import { media, season } from "@canto/db/schema";
import type { MediaType } from "@canto/providers";
import { updateMediaFromNormalized, getSupportedLanguageCodes } from "@canto/db/persist-media";
import { findMediaById, findMediaByExternalId } from "../../infrastructure/repositories";
import { logAndSwallow } from "../../lib/log-error";
import type { MediaProviderPort } from "../ports/media-provider.port";
import type { JobDispatcherPort } from "../ports/job-dispatcher.port";

export async function replaceMediaProvider(
  db: Database,
  mediaId: string,
  targetProvider: "tmdb" | "tvdb",
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort; dispatcher: JobDispatcherPort },
): Promise<typeof media.$inferSelect> {
  const row = await findMediaById(db, mediaId);
  if (!row) throw new Error("Media not found");
  if (row.provider === targetProvider) throw new Error(`Media is already using ${targetProvider}`);
  if (row.type === "movie" && targetProvider === "tvdb") throw new Error("TVDB does not support movies");

  const provider = targetProvider === "tmdb" ? deps.tmdb : deps.tvdb;

  // Find equivalent on target provider
  let targetExternalId: number | null = null;

  // Try cross-reference IDs first
  if (targetProvider === "tvdb" && row.tvdbId) {
    targetExternalId = row.tvdbId;
  } else if (targetProvider === "tmdb" && row.imdbId && deps.tmdb.findByImdbId) {
    try {
      const found = await deps.tmdb.findByImdbId(row.imdbId);
      const match = found.find((r) => r.type === row.type);
      if (match) targetExternalId = match.externalId;
    } catch { /* fallback to search */ }
  }

  // Fallback: title search
  if (!targetExternalId) {
    const searchResults = await provider.search(row.title, row.type as MediaType);
    if (searchResults.results.length > 0) {
      targetExternalId = searchResults.results[0]!.externalId;
    }
  }

  if (!targetExternalId) throw new Error(`Could not find "${row.title}" on ${targetProvider}`);

  // Check if a media with this externalId+provider already exists (avoid unique constraint violation)
  const existing = await findMediaByExternalId(db, targetExternalId, targetProvider);
  if (existing && existing.id !== mediaId) {
    // Merge: delete the duplicate and keep the current one
    await db.delete(media).where(eq(media.id, existing.id));
  }

  // Fetch full metadata from target provider
  const supportedLangs = [...await getSupportedLanguageCodes(db)];
  const normalized = await provider.getMetadata(targetExternalId, row.type as MediaType, { supportedLanguages: supportedLangs });

  // Preserve TMDB data when replacing with TVDB
  // TVDB lacks ratings/popularity and often has inferior images/text vs TMDB
  if (targetProvider === "tvdb") {
    normalized.title = row.title ?? normalized.title;
    normalized.overview = row.overview ?? normalized.overview;
    normalized.tagline = row.tagline ?? normalized.tagline;
    normalized.voteAverage = row.voteAverage ?? normalized.voteAverage;
    normalized.voteCount = row.voteCount ?? normalized.voteCount;
    normalized.popularity = row.popularity ?? normalized.popularity;
    normalized.posterPath = row.posterPath ?? normalized.posterPath;
    normalized.backdropPath = row.backdropPath ?? normalized.backdropPath;
    normalized.logoPath = row.logoPath ?? normalized.logoPath;
  }

  // Delete existing seasons (cascade deletes episodes)
  await db.delete(season).where(eq(season.mediaId, mediaId));

  // Update media with new provider data
  const updated = await updateMediaFromNormalized(db, mediaId, normalized);

  // Dispatch refresh-extras to populate credits/similar/recommendations from TMDB
  void deps.dispatcher.refreshExtras(mediaId).catch(logAndSwallow("replace-provider dispatchRefreshExtras"));

  return updated;
}
