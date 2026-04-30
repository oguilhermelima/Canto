export type TraktListLinkId = string & { readonly __brand: "TraktListLinkId" };

/**
 * Pairing row between a remote Trakt list and a local `list` row. One row per
 * (userConnection, traktListId). `localListId` is unique — a Trakt list can
 * only mirror to one local list at a time.
 */
export interface TraktListLink {
  id: TraktListLinkId;
  userConnectionId: string;
  traktListId: number;
  traktListSlug: string;
  localListId: string;
  remoteUpdatedAt: Date | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTraktListLink {
  userConnectionId: string;
  traktListId: number;
  traktListSlug: string;
  localListId: string;
  remoteUpdatedAt?: Date | null;
  lastSyncedAt?: Date;
}
