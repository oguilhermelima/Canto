/* -------------------------------------------------------------------------- */
/*  Media resolution cache                                                    */
/*                                                                            */
/*  Per-run anchor memoization for the sync pipeline. Different (source,      */
/*  serverItemId) observations can map to the same canonical Canto media —    */
/*  e.g. a Plex 1080p and a Jellyfin 4K of the same movie. Caching the        */
/*  resolved anchor by tmdbId prevents redundant TMDB lookups + DB writes     */
/*  when items in the same batch share an identifier.                         */
/*                                                                            */
/*  Batch DB resolvers used by reverse-sync (`batchResolveMediaByExternalRefs`*/
/*  / `batchResolveMediaVersionsByServerItemIds` /                            */
/*  `batchResolveEpisodesByMediaAndNumbers`) live in                          */
/*  `infra/sync/batch-resolvers.ts`; they're composition-root utilities and   */
/*  are not consumed by any domain use case.                                  */
/* -------------------------------------------------------------------------- */

export interface ResolvedMediaAnchor {
  mediaId: string;
  tmdbId: number;
  isNewImport: boolean;
}

/** Per-run memoization keyed by canonical TMDB id. */
export type MediaAnchorCache = Map<number, ResolvedMediaAnchor>;

export function createMediaAnchorCache(): MediaAnchorCache {
  return new Map();
}
