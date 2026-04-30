/* -------------------------------------------------------------------------- */
/*  PlexAdapterPort                                                           */
/*                                                                            */
/*  The narrow surface of Plex HTTP operations the domain layer depends on.  */
/*  Mirrors the shape of `infra/media-servers/plex.adapter.ts` but only the   */
/*  functions that use-cases (authenticate, discover, update-metadata,        */
/*  trigger-scans, services) actually call. The full adapter surface (mark   */
/*  watched, set playback position, find by guid, fetch leaves with media —   */
/*  used by `domain/user-media`) stays as direct imports until the user-media */
/*  wave runs.                                                                */
/* -------------------------------------------------------------------------- */

export interface PlexSection {
  key: string;
  title: string;
  type: string;
  Location: Array<{ path: string }>;
}

export type AuthServerTokenResult =
  | { ok: true; serverName: string; machineId: string; user?: string; userId?: string }
  | { ok: false; status: number };

export type PlexTvSignInResult =
  | { ok: true; token: string; userId: string; username: string }
  | { ok: false; status: number };

export type CheckPinResult =
  | { authenticated: true; token: string }
  | { authenticated: false; expired: boolean };

export interface PlexAdapterPort {
  /** Validate a Plex server token + return identity/server fields. */
  authenticateServerToken(url: string, token: string): Promise<AuthServerTokenResult>;
  /** Sign in to plex.tv with email/password to obtain a fresh token. */
  plexTvSignIn(email: string, password: string): Promise<PlexTvSignInResult>;
  /** Create a PIN on plex.tv for the OAuth flow. */
  createPin(clientId: string): Promise<{ id: number; code: string }>;
  /** Poll a plex.tv PIN until claimed/expired. */
  checkPin(clientId: string, pinId: number): Promise<CheckPinResult>;
  /** Fetch the Plex account identity for a given token. */
  getTvUser(
    clientId: string,
    token: string,
  ): Promise<{ userId: string; username: string } | null>;
  /** Discover a server resource visible to the token (PIN flow auto-detect). */
  getTvServerResource(
    clientId: string,
    token: string,
  ): Promise<{ machineId: string; serverName: string } | null>;
  /** Test a server connection by hitting the root resource. */
  testConnection(url: string, token: string): Promise<{ serverName: string; version: string }>;
  /** List a server's library sections. */
  getSections(url: string, token: string): Promise<PlexSection[]>;
  /** Read a single item's current metadata. */
  getItem(
    url: string,
    token: string,
    ratingKey: string,
  ): Promise<{ title: string; year?: number } | null>;
  /** Force a Plex item to re-match a specific TMDB id. */
  matchItem(
    url: string,
    token: string,
    ratingKey: string,
    tmdbId: number,
    options?: { name?: string; language?: string },
  ): Promise<void>;
  /** Lock fields on a Plex item to survive a future scan. */
  lockFields(
    url: string,
    token: string,
    ratingKey: string,
    type: 1 | 2,
    fields?: readonly string[],
  ): Promise<void>;
  /** Trigger a library scan on one or more Plex sections (all if omitted). */
  scanLibrary(url: string, token: string, sectionIds?: string[]): Promise<void>;
}
