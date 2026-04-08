import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import { persistMedia, getSupportedLanguageCodes } from "@canto/db/persist-media";
import {
  findSyncItemById,
  updateSyncItem,
} from "../../infrastructure/repositories/sync-repository";
import {
  findMediaByAnyReference,
  updateMedia,
  deleteMedia,
  isMediaOrphaned,
} from "../../infrastructure/repositories/media-repository";

/**
 * Resolve a sync item (failed or imported) with a specific TMDB ID.
 * Fetches metadata, persists to DB, marks as imported.
 * If re-matching an already-imported item, cleans up orphaned old media.
 */
export async function resolveSyncItem(
  db: Database,
  input: { syncItemId: string; tmdbId: number; type: "movie" | "show" },
  tmdb: MediaProviderPort,
) {
  const item = await findSyncItemById(db, input.syncItemId);
  if (!item) throw new Error("Sync item not found");

  const oldMediaId = item.mediaId;

  const supportedLangs = [...await getSupportedLanguageCodes(db)];
  const normalized = await tmdb.getMetadata(input.tmdbId, input.type, { supportedLanguages: supportedLangs });

  const existing = await findMediaByAnyReference(db, input.tmdbId, "tmdb");

  let mediaId: string;
  if (existing) {
    mediaId = existing.id;
    if (!existing.inLibrary || !existing.downloaded) {
      const updates: Record<string, unknown> = {
        inLibrary: true, downloaded: true, libraryPath: item.serverItemPath, addedAt: existing.addedAt ?? new Date(),
      };
      if (item.libraryId) updates.libraryId = item.libraryId;
      await updateMedia(db, existing.id, updates);
    }
  } else {
    const inserted = await persistMedia(db, normalized);
    const updates: Record<string, unknown> = {
      inLibrary: true, downloaded: true, libraryPath: item.serverItemPath, addedAt: new Date(),
    };
    if (item.libraryId) updates.libraryId = item.libraryId;
    await updateMedia(db, inserted.id, updates);
    mediaId = inserted.id;
  }

  await updateSyncItem(db, input.syncItemId, {
    tmdbId: input.tmdbId, mediaId, result: "imported", reason: null,
  });

  // Clean up orphaned old media (re-match scenario)
  if (oldMediaId && oldMediaId !== mediaId) {
    const orphaned = await isMediaOrphaned(db, oldMediaId, input.syncItemId);
    if (orphaned) {
      await deleteMedia(db, oldMediaId);
      console.log(`[resolve-sync-item] Deleted orphaned media ${oldMediaId}`);
    }
  }

  const suggestedName = `${normalized.title} (${normalized.year ?? "Unknown"}) [tmdb-${input.tmdbId}]`;
  return { mediaId, suggestedName };
}
