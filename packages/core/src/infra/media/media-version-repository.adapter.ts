import type { Database } from "@canto/db/client";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import {
  createMediaVersionEpisodes,
  deleteMediaVersionById,
  deleteMediaVersionEpisodesByVersionId,
  fetchMediaVersionsWithMedia,
  findMediaVersionById,
  findMediaVersionBySourceAndServerItemId,
  findMediaVersionsByMediaId,
  findMediaVersionsWithEpisodes,
  getMediaVersionCounts,
  pruneStaleMediaVersions,
  touchMediaVersionsSeen,
  updateMediaVersion,
  upsertMediaVersion,
} from "@canto/core/infra/media/media-version-repository";

/**
 * Wires the legacy `media-version-repository` functions into the domain
 * `MediaVersionRepositoryPort`. The composition root constructs one of these
 * with its `Database` handle and threads it into use cases via deps.
 */
export function makeMediaVersionRepository(
  db: Database,
): MediaVersionRepositoryPort {
  return {
    findById: (id) => findMediaVersionById(db, id),
    findByMediaId: (mediaId) => findMediaVersionsByMediaId(db, mediaId),
    findBySourceAndServerItemId: (source, serverItemId) =>
      findMediaVersionBySourceAndServerItemId(db, source, serverItemId),
    findWithEpisodesByMediaId: (mediaId) =>
      findMediaVersionsWithEpisodes(db, mediaId),
    findWithMedia: (language, filters) =>
      fetchMediaVersionsWithMedia(db, language, filters),
    countGroups: () => getMediaVersionCounts(db),

    upsert: (input) => upsertMediaVersion(db, input),
    update: (id, input) => updateMediaVersion(db, id, input),
    deleteById: (id) => deleteMediaVersionById(db, id),

    createEpisodes: (input) => createMediaVersionEpisodes(db, input),
    deleteEpisodesByVersionId: (versionId) =>
      deleteMediaVersionEpisodesByVersionId(db, versionId),

    pruneStale: (source, serverLinkIds, cutoffDate) =>
      pruneStaleMediaVersions(db, source, serverLinkIds, cutoffDate),
    touchSeen: (source, serverItemIds, now) =>
      touchMediaVersionsSeen(db, source, serverItemIds, now),
  };
}
