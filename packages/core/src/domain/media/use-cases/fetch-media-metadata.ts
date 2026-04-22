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
        if (results.results.length > 0) resolvedTvdbId = results.results[0]!.externalId;
      } catch {
        tvdbFailed = true;
      }
    }

    if (resolvedTvdbId) {
      try {
        const tvdbData = await deps.tvdb.getMetadata(resolvedTvdbId, "show");
        tvdbSeasons = tvdbData.seasons;
      } catch (err) {
        tvdbFailed = true;
        console.warn(`[fetchMediaMetadata] TVDB structure failed for "${media.title}" (tvdbId=${resolvedTvdbId}):`, err instanceof Error ? err.message : err);
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
      if (search.results.length > 0) tmdbExternalId = search.results[0]!.externalId;
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
