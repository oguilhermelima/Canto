export type UserMediaLibraryId = string
  & { readonly __brand: "UserMediaLibraryId" };

/** Pairing row between a user and a media item available on one of their
 *  enabled servers. Idempotent on (userId, mediaId, source). */
export interface UserMediaLibrary {
  id: UserMediaLibraryId;
  userId: string;
  mediaId: string;
  source: "jellyfin" | "plex";
  serverLinkId: string | null;
  serverItemId: string | null;
  addedAt: Date;
  lastSyncedAt: Date;
}

export interface NewUserMediaLibrary {
  userId: string;
  mediaId: string;
  source: "jellyfin" | "plex";
  serverLinkId?: string | null;
  serverItemId?: string | null;
}
