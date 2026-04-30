import type {
  NewUserMediaLibrary,
  UserMediaLibrary,
  UserMediaLibraryId,
} from "@canto/core/domain/user-media/types/user-media-library";
import type { userMediaLibrary } from "@canto/db/schema";

type Row = typeof userMediaLibrary.$inferSelect;

export function toDomain(row: Row): UserMediaLibrary {
  return {
    id: row.id as UserMediaLibraryId,
    userId: row.userId,
    mediaId: row.mediaId,
    source: row.source as "jellyfin" | "plex",
    serverLinkId: row.serverLinkId,
    serverItemId: row.serverItemId,
    addedAt: row.addedAt,
    lastSyncedAt: row.lastSyncedAt,
  };
}

export function toRow(input: NewUserMediaLibrary): {
  userId: string;
  mediaId: string;
  source: "jellyfin" | "plex";
  serverLinkId: string | null;
  serverItemId: string | null;
} {
  return {
    userId: input.userId,
    mediaId: input.mediaId,
    source: input.source,
    serverLinkId: input.serverLinkId ?? null,
    serverItemId: input.serverItemId ?? null,
  };
}
