import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../ports/media-provider.port";
import { persistMedia, getSupportedLanguageCodes } from "@canto/db/persist-media";
import {
  findSyncItemById,
  updateSyncItem,
} from "../../infrastructure/repositories/sync-repository";
import { findMediaByAnyReference, updateMedia } from "../../infrastructure/repositories/media-repository";

/**
 * Manually resolve a failed sync item with a specific TMDB ID.
 * Fetches metadata, persists to DB, marks as imported.
 */
export async function resolveSyncItem(
  db: Database,
  input: { syncItemId: string; tmdbId: number; type: "movie" | "show" },
  tmdb: MediaProviderPort,
) {
  const item = await findSyncItemById(db, input.syncItemId);
  if (!item) throw new Error("Sync item not found");

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

  const suggestedName = `${normalized.title} (${normalized.year ?? "Unknown"}) [tmdb-${input.tmdbId}]`;
  return { mediaId, suggestedName };
}
