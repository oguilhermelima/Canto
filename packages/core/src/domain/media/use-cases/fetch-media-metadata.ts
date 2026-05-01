import type {
  MediaExtras,
  MediaType,
  NormalizedMedia,
  NormalizedSeason,
  ProviderName,
} from "@canto/providers";

import type { MediaProviderPort } from "../../shared/ports/media-provider.port";

export interface FetchMediaMetadataOpts {
  reprocess?: boolean;
  useTVDBSeasons?: boolean;
  supportedLanguages?: string[];
}

export interface MediaMetadata {
  media: NormalizedMedia;
  extras: MediaExtras;
  tvdbSeasons?: NormalizedSeason[];
  tvdbId?: number;
  /** True when TVDB season fetch was attempted but failed (API error, timeout, etc.) */
  tvdbFailed?: boolean;
}

/**
 * Per-process memo of TVDB IDs that returned 404. Reconciles run on a fixed
 * cadence and re-fetch every show, so without this we'd hammer TVDB (and
 * spam logs) for IDs that we already know are gone upstream. Cleared on
 * worker restart, which is fine — TVDB rarely un-deletes records.
 */
const tvdbMissingIds = new Set<number>();

/**
 * Pure function — no DB reads, no DB writes, no job dispatches.
 * Fetches complete media metadata from providers (TMDB + optionally TVDB).
 */
export async function fetchMediaMetadata(
  externalId: number,
  provider: ProviderName,
  type: MediaType,
  deps: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
  opts?: FetchMediaMetadataOpts,
): Promise<MediaMetadata> {
  const supportedLangs = opts?.supportedLanguages;
  const metadataOpts = supportedLangs ? { supportedLanguages: supportedLangs } : undefined;

  // Determine which provider to use for base metadata
  const metadataProvider = provider === "tvdb" ? deps.tvdb : deps.tmdb;

  // Phase 1: Fetch base metadata + extras
  // For TMDB: parallel (externalId is already the TMDB ID)
  // For non-TMDB: sequential (need metadata's imdbId/title to resolve TMDB ID)
  let media: NormalizedMedia;
  let extras: MediaExtras;

  if (provider === "tmdb") {
    [media, extras] = await Promise.all([
      metadataProvider.getMetadata(externalId, type, metadataOpts),
      deps.tmdb.getExtras(externalId, type, { supportedLanguages: supportedLangs }),
    ]);
  } else {
    media = await metadataProvider.getMetadata(externalId, type, metadataOpts);
    extras = await resolveAndFetchExtras(media, type, deps.tmdb, supportedLangs);
  }

  // Phase 2: TVDB structure (shows only, when enabled)
  let tvdbSeasons: NormalizedSeason[] | undefined;
  let resolvedTvdbId: number | undefined;
  let tvdbFailed = false;

  if (type === "show" && opts?.useTVDBSeasons && provider !== "tvdb") {
    // Resolve TVDB ID from metadata cross-refs or title search
    resolvedTvdbId = media.tvdbId ?? undefined;
    if (!resolvedTvdbId) {
      try {
        const results = await deps.tvdb.search(media.title, "show");
        const first = results.results[0];
        if (first) resolvedTvdbId = first.externalId;
      } catch {
        tvdbFailed = true;
      }
    }

    if (resolvedTvdbId && tvdbMissingIds.has(resolvedTvdbId)) {
      tvdbFailed = true;
    } else if (resolvedTvdbId) {
      try {
        const tvdbData = await deps.tvdb.getMetadata(resolvedTvdbId, "show");
        tvdbSeasons = tvdbData.seasons;
        if (tvdbData.airsTime && !media.airsTime) {
          media.airsTime = tvdbData.airsTime;
        }
      } catch (err) {
        tvdbFailed = true;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("404")) {
          tvdbMissingIds.add(resolvedTvdbId);
          console.warn(
            `[fetchMediaMetadata] TVDB ${resolvedTvdbId} for "${media.title}" returned 404 — caching miss until next restart`,
          );
        } else {
          console.warn(
            `[fetchMediaMetadata] TVDB structure failed for "${media.title}" (tvdbId=${resolvedTvdbId}): ${message}`,
          );
        }
      }
    }
  }

  // For TVDB-native shows, the base metadata already has TVDB seasons
  if (provider === "tvdb") {
    tvdbSeasons = media.seasons;
    resolvedTvdbId = externalId;
  }

  return {
    media,
    extras,
    tvdbSeasons,
    tvdbId: resolvedTvdbId,
    tvdbFailed,
  };
}

/**
 * Resolve TMDB external ID for non-TMDB providers and fetch extras.
 * Uses IMDB cross-ref first, then falls back to title search.
 * Same logic as refresh-extras.ts lines 29-47, adapted for pure function (no DB reads).
 */
async function resolveAndFetchExtras(
  metadata: NormalizedMedia,
  type: MediaType,
  tmdb: MediaProviderPort,
  supportedLanguages?: string[],
): Promise<MediaExtras> {
  let tmdbExternalId: number | undefined;

  // Try IMDB cross-reference first
  if (metadata.imdbId && tmdb.findByImdbId) {
    try {
      const found = await tmdb.findByImdbId(metadata.imdbId);
      const match = found.find((r) => r.type === type);
      if (match) tmdbExternalId = match.externalId;
    } catch { /* fallback to title search */ }
  }

  // If IMDB didn't work, try title search
  if (tmdbExternalId === undefined) {
    try {
      const search = await tmdb.search(metadata.title, type);
      const first = search.results[0];
      if (first) tmdbExternalId = first.externalId;
    } catch { /* skip extras if we can't find TMDB equivalent */ }
  }

  if (tmdbExternalId === undefined) {
    // Can't find TMDB match — return empty extras
    return {
      credits: { cast: [], crew: [] },
      similar: [],
      recommendations: [],
      videos: [],
    };
  }

  return tmdb.getExtras(tmdbExternalId, type, { supportedLanguages });
}
