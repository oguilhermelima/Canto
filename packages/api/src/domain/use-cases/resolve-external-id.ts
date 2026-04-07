/* -------------------------------------------------------------------------- */
/*  Use-case: Resolve TMDB ID from IMDB ID or title search (with retry)      */
/* -------------------------------------------------------------------------- */

import type { TmdbProvider } from "@canto/providers";

const TMDB_DELAY_MS = 300;
const TMDB_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tmdbCall<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      await sleep(TMDB_DELAY_MS);
      return result;
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt < TMDB_MAX_RETRIES) {
        const backoff = 2_000 * Math.pow(2, attempt);
        console.warn(`[resolve-external-id] TMDB rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${TMDB_MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error("TMDB call failed after retries");
}

export { tmdbCall };

export interface ResolvedExternalId {
  tmdbId: number;
  resolvedType: "movie" | "show";
}

/**
 * Resolve a TMDB ID from an IMDB ID or title search.
 * Returns null if no match can be found.
 */
export async function resolveExternalId(
  tmdb: TmdbProvider,
  item: { tmdbId?: number; imdbId?: string; title: string; year?: number; type: "movie" | "show" },
): Promise<ResolvedExternalId | null> {
  if (item.tmdbId) {
    return { tmdbId: item.tmdbId, resolvedType: item.type };
  }

  // Try IMDB ID lookup first
  if (item.imdbId) {
    const results = await tmdbCall(() => tmdb.findByImdbId(item.imdbId!));
    const match = results.find((r) => r.type === item.type) ?? results[0];
    if (match) {
      return { tmdbId: match.externalId, resolvedType: match.type as "movie" | "show" };
    }
  }

  // Fall back to title search
  const query = item.year ? `${item.title} ${item.year}` : item.title;
  const searchResult = await tmdbCall(() => tmdb.search(query, item.type));
  if (searchResult.results.length === 1) {
    return {
      tmdbId: searchResult.results[0]!.externalId,
      resolvedType: searchResult.results[0]!.type as "movie" | "show",
    };
  }

  return null;
}
