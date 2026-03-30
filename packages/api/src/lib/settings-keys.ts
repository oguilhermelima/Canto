export const SETTINGS = {
  // Jellyfin
  JELLYFIN_URL: "jellyfin.url",
  JELLYFIN_API_KEY: "jellyfin.apiKey",

  // Plex
  PLEX_URL: "plex.url",
  PLEX_TOKEN: "plex.token",
  PLEX_CLIENT_ID: "plex.clientId",
  PLEX_MACHINE_ID: "plex.machineId",

  // qBittorrent
  QBITTORRENT_URL: "qbittorrent.url",
  QBITTORRENT_USERNAME: "qbittorrent.username",
  QBITTORRENT_PASSWORD: "qbittorrent.password",

  // Indexers
  PROWLARR_ENABLED: "prowlarr.enabled",
  PROWLARR_URL: "prowlarr.url",
  PROWLARR_API_KEY: "prowlarr.apiKey",
  JACKETT_ENABLED: "jackett.enabled",
  JACKETT_URL: "jackett.url",
  JACKETT_API_KEY: "jackett.apiKey",

  // TMDB
  TMDB_API_KEY: "tmdb.apiKey",

  // Sync
  SYNC_MEDIA_IMPORT_STATUS: "sync.mediaImport.status",

  // Cache
  CACHE_SPOTLIGHT: "cache.spotlight",
} as const;
