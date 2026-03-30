import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { media } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";

import { getJackettClient } from "../../infrastructure/adapters/jackett";
import { getProwlarrClient } from "../../infrastructure/adapters/prowlarr";
import { detectQuality, detectSource } from "../rules/quality";
import { calculateConfidence } from "../rules/scoring";
import type { ConfidenceContext } from "../types/common";
import type { IndexerResult } from "../types/torrent";

export interface SearchResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  indexer: string;
  seeders: number;
  leechers: number;
  age: number;
  flags: string[];
  quality: string;
  source: string;
  confidence: number;
  categories: Array<{ id: number; name: string }>;
}

export async function searchTorrents(
  db: Database,
  input: { mediaId: string; seasonNumber?: number; episodeNumbers?: number[] | null },
): Promise<SearchResult[]> {
  const row = await db.query.media.findFirst({
    where: eq(media.id, input.mediaId),
  });

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Media not found",
    });
  }

  // Build search query
  let query = row.title;
  if (input.seasonNumber !== undefined) {
    const paddedSeason = String(input.seasonNumber).padStart(2, "0");
    if (
      input.episodeNumbers &&
      input.episodeNumbers.length === 1 &&
      input.episodeNumbers[0] !== undefined
    ) {
      // Single episode: use S01E01 format
      const paddedEp = String(input.episodeNumbers[0]).padStart(2, "0");
      query += ` S${paddedSeason}E${paddedEp}`;
    } else {
      // Multiple episodes or no episodes: use season pack query
      query += ` S${paddedSeason}`;
    }
  }

  const prowlarrEnabled =
    (await getSetting<boolean>("prowlarr.enabled")) === true;
  const jackettEnabled =
    (await getSetting<boolean>("jackett.enabled")) === true;

  if (!prowlarrEnabled && !jackettEnabled) {
    return [];
  }

  const searches: Promise<IndexerResult[]>[] = [];
  if (prowlarrEnabled) {
    const prowlarr = await getProwlarrClient();
    searches.push(prowlarr.search(query));
  }
  if (jackettEnabled) {
    const jackett = await getJackettClient();
    searches.push(jackett.search(query));
  }

  let results: IndexerResult[];
  try {
    const settled = await Promise.allSettled(searches);
    results = [];
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(...s.value);
    }
    // Deduplicate by title
    const seen = new Set<string>();
    results = results.filter((r) => {
      const key = r.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Indexer search failed: ${message}`,
    });
  }

  // Determine if media has a digital release (not just in theaters)
  // A movie released > 3 months ago, or with status "Released", or a show,
  // is considered to have a digital release available.
  const isShow = row.type === "show";
  const releaseDate = row.releaseDate ? new Date(row.releaseDate) : null;
  const monthsSinceRelease = releaseDate
    ? (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    : Infinity;
  const hasDigitalRelease = isShow || monthsSinceRelease > 3;

  const confidenceCtx: ConfidenceContext = { hasDigitalRelease };

  return results
    .map((r) => {
      const flags = r.indexerFlags ?? [];
      const quality = detectQuality(r.title);
      const confidence = calculateConfidence(
        r.title, quality, flags, r.seeders, r.age ?? 0, confidenceCtx,
      );
      return {
        guid: r.guid,
        title: r.title,
        size: r.size,
        publishDate: r.publishDate,
        downloadUrl: r.downloadUrl,
        magnetUrl: r.magnetUrl,
        infoUrl: r.infoUrl,
        indexer: r.indexer,
        seeders: r.seeders,
        leechers: r.leechers,
        age: r.age ?? 0,
        flags,
        quality,
        source: detectSource(r.title),
        confidence,
        categories: r.categories,
      };
    })
    .filter((r) => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}
