/**
 * Admin-level credentials for the configured Plex / Jellyfin servers. Read
 * from the persistent settings store and consumed wherever a use case needs
 * the URL + token pair without going through a per-user `userConnection`.
 */
export interface JellyfinServerCredentials {
  url: string;
  apiKey: string;
}

export interface PlexServerCredentials {
  url: string;
  token: string;
}

export interface ServerCredentialsPort {
  /** Returns null when the admin has not configured Jellyfin yet. */
  getJellyfin(): Promise<JellyfinServerCredentials | null>;
  /** Returns null when the admin has not configured Plex yet. */
  getPlex(): Promise<PlexServerCredentials | null>;
}
