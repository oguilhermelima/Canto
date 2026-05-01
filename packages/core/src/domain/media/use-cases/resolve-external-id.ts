/* -------------------------------------------------------------------------- */
/*  Use-case: Resolve TMDB ID from external IDs (trust-first, no title search) */
/* -------------------------------------------------------------------------- */

import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import { TmdbCallExhaustedError } from "@canto/core/domain/media/errors";

const TMDB_DELAY_MS = 300;
const TMDB_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TmdbCallDeps {
  logger?: LoggerPort;
}

async function tmdbCall<T>(
  fn: () => Promise<T>,
  deps?: TmdbCallDeps,
): Promise<T> {
  for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      await sleep(TMDB_DELAY_MS);
      return result;
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt < TMDB_MAX_RETRIES) {
        const backoff = 2_000 * Math.pow(2, attempt);
        deps?.logger?.warn(
          `[resolve-external-id] TMDB rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${TMDB_MAX_RETRIES})`,
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new TmdbCallExhaustedError();
}

export { tmdbCall };

export interface ResolvedExternalId {
  tmdbId: number;
  resolvedType: "movie" | "show";
}

/* -------------------------------------------------------------------------- */
/*  Main resolver                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a TMDB ID by trusting provider IDs. We are a sync, not a matcher:
 *   1. If item.tmdbId → return directly.
 *   2. Else if item.imdbId → TMDB /find → prefer type match, else first.
 *   3. Else if item.tvdbId → TMDB /find → prefer type match, else first.
 *   4. Else return null.
 *
 * Any thrown error is swallowed and returned as null — the caller will mark
 * the sync item as "unmatched" and surface it for admin action.
 */
export async function resolveExternalId(
  tmdb: MediaProviderPort,
  item: {
    tmdbId?: number;
    imdbId?: string;
    tvdbId?: number;
    type: "movie" | "show";
  },
  deps?: TmdbCallDeps,
): Promise<ResolvedExternalId | null> {
  try {
    if (item.tmdbId) {
      return { tmdbId: item.tmdbId, resolvedType: item.type };
    }

    const findByImdbId = tmdb.findByImdbId;
    if (item.imdbId && findByImdbId) {
      const imdbId = item.imdbId;
      const results = await tmdbCall(() => findByImdbId(imdbId), deps);
      const match = results.find((r) => r.type === item.type) ?? results[0];
      if (match) {
        return {
          tmdbId: match.externalId,
          resolvedType: match.type as "movie" | "show",
        };
      }
    }

    const findByTvdbId = tmdb.findByTvdbId;
    if (item.tvdbId && findByTvdbId) {
      const tvdbId = item.tvdbId;
      const results = await tmdbCall(() => findByTvdbId(tvdbId), deps);
      const match = results.find((r) => r.type === item.type) ?? results[0];
      if (match) {
        return {
          tmdbId: match.externalId,
          resolvedType: match.type as "movie" | "show",
        };
      }
    }

    return null;
  } catch (err) {
    deps?.logger?.warn(
      `[resolve-external-id] lookup failed, returning null`,
      { err: err instanceof Error ? err.message : err },
    );
    return null;
  }
}
