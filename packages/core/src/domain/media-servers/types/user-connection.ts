/* -------------------------------------------------------------------------- */
/*  UserConnection types                                                      */
/*                                                                            */
/*  A `userConnection` row is the per-user binding between a Canto user and a */
/*  remote media-server identity (Plex token, Jellyfin api-key, Trakt access  */
/*  token). The provider discriminator splits the three protocols.            */
/* -------------------------------------------------------------------------- */

export type UserConnectionId = string & { readonly __brand: "UserConnectionId" };

/** Provider discriminator for the user_connection table. */
export type ConnectionKind = "plex" | "jellyfin" | "trakt";

export interface UserConnection {
  id: UserConnectionId;
  userId: string;
  provider: ConnectionKind;
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  externalUserId: string | null;
  /** Plex sections / Jellyfin libraries the connection has read access to. */
  accessibleLibraries: string[] | null;
  enabled: boolean;
  /** Free-form reason why the connection is currently considered stale —
   *  most commonly "Authentication failed — token may be expired". `null`
   *  for healthy connections. */
  staleReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUserConnection {
  userId: string;
  provider: ConnectionKind;
  token?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  externalUserId?: string | null;
  accessibleLibraries?: string[] | null;
  enabled?: boolean;
}

/** Patch applied by `update` calls — every field is optional and `undefined`
 *  fields are skipped in the SQL `SET` clause. */
export interface UpdateUserConnectionInput {
  token?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  externalUserId?: string | null;
  accessibleLibraries?: string[] | null;
  enabled?: boolean;
  staleReason?: string | null;
}
