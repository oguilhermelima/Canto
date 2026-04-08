/* -------------------------------------------------------------------------- */
/*  Use-case: Resolve TMDB ID from external IDs or title search (with retry)  */
/* -------------------------------------------------------------------------- */

import type { TmdbProvider, SearchResult } from "@canto/providers";

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

/* -------------------------------------------------------------------------- */
/*  Title scoring                                                              */
/* -------------------------------------------------------------------------- */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function scoreTitleMatch(
  result: SearchResult,
  title: string,
  year?: number,
): number {
  let score = 0;

  const normalizedTitle = normalize(title);
  const matchesTitle = normalize(result.title) === normalizedTitle;
  const matchesOriginal = result.originalTitle
    ? normalize(result.originalTitle) === normalizedTitle
    : false;

  if (matchesTitle || matchesOriginal) score += 50;

  if (year && result.year) {
    if (result.year === year) score += 30;
    else if (Math.abs(result.year - year) <= 1) score += 15;
  }

  score += Math.min(result.popularity ?? 0, 100) / 10;

  return score;
}

/* -------------------------------------------------------------------------- */
/*  Main resolver                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a TMDB ID using a multi-step chain:
 * 1. Validate server-provided tmdbId against title search
 * 2. IMDB ID → TMDB /find
 * 3. TVDB ID → TMDB /find
 * 4. Ranked title search
 */
export async function resolveExternalId(
  tmdb: TmdbProvider,
  item: {
    tmdbId?: number;
    imdbId?: string;
    tvdbId?: number;
    title: string;
    year?: number;
    type: "movie" | "show";
  },
): Promise<ResolvedExternalId | null> {
  // Cache search results from Step 1 to reuse in Step 4
  let searchResults: SearchResult[] | null = null;

  // Step 1 — Validate tmdbId if present
  if (item.tmdbId) {
    const searchData = await tmdbCall(() => tmdb.search(item.title, item.type));
    searchResults = searchData.results;

    if (searchResults.some((r) => r.externalId === item.tmdbId)) {
      return { tmdbId: item.tmdbId, resolvedType: item.type };
    }

    console.warn(
      `[resolve-external-id] tmdbId ${item.tmdbId} not found in search results for "${item.title}", falling through`,
    );
  }

  // Step 2 — IMDB ID lookup
  if (item.imdbId) {
    const results = await tmdbCall(() => tmdb.findByImdbId(item.imdbId!));
    const match = results.find((r) => r.type === item.type) ?? results[0];
    if (match) {
      return { tmdbId: match.externalId, resolvedType: match.type as "movie" | "show" };
    }
  }

  // Step 3 — TVDB ID lookup
  if (item.tvdbId && tmdb.findByTvdbId) {
    const results = await tmdbCall(() => tmdb.findByTvdbId!(item.tvdbId!));
    const match = results.find((r) => r.type === item.type) ?? results[0];
    if (match) {
      return { tmdbId: match.externalId, resolvedType: match.type as "movie" | "show" };
    }
  }

  // Step 4 — Ranked title search (reuse results from Step 1 if available)
  if (!searchResults) {
    const query = item.year ? `${item.title} ${item.year}` : item.title;
    const searchData = await tmdbCall(() => tmdb.search(query, item.type));
    searchResults = searchData.results;
  }

  if (searchResults.length === 0) return null;

  let bestScore = 0;
  let bestResult: SearchResult | null = null;

  for (const r of searchResults) {
    const score = scoreTitleMatch(r, item.title, item.year);
    if (score > bestScore) {
      bestScore = score;
      bestResult = r;
    }
  }

  if (bestResult && bestScore >= 50) {
    return {
      tmdbId: bestResult.externalId,
      resolvedType: bestResult.type as "movie" | "show",
    };
  }

  return null;
}
