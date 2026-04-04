export const SETTINGS = {
  // Jellyfin
  JELLYFIN_ENABLED: "jellyfin.enabled",
  JELLYFIN_URL: "jellyfin.url",
  JELLYFIN_API_KEY: "jellyfin.apiKey",

  // Plex
  PLEX_ENABLED: "plex.enabled",
  PLEX_URL: "plex.url",
  PLEX_TOKEN: "plex.token",
  PLEX_CLIENT_ID: "plex.clientId",
  PLEX_MACHINE_ID: "plex.machineId",

  // qBittorrent
  QBITTORRENT_ENABLED: "qbittorrent.enabled",
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

  // Search
  SEARCH_MAX_INDEXERS: "search.maxIndexers",
  SEARCH_TIMEOUT: "search.timeout",
  SEARCH_CONCURRENCY: "search.concurrency",

  // TMDB
  TMDB_API_KEY: "tmdb.apiKey",

  // Language
  LANGUAGE: "general.language",

  // TVDB
  TVDB_ENABLED: "tvdb.enabled",
  TVDB_API_KEY: "tvdb.apiKey",
  TVDB_TOKEN: "tvdb.token",
  TVDB_TOKEN_EXPIRES: "tvdb.tokenExpires",
  TVDB_DEFAULT_SHOWS: "tvdb.defaultShows",

  // Sync
  SYNC_MEDIA_IMPORT_STATUS: "sync.mediaImport.status",

  // Redis
  REDIS_HOST: "redis.host",
  REDIS_PORT: "redis.port",

  // Downloads & Paths
  ROOT_DATA_PATH: "paths.rootDataPath",
  /** "local" (hardlinks, requires filesystem access) or "remote" (qBit API, no filesystem needed) */
  IMPORT_METHOD: "download.importMethod",
  SEED_RATIO_LIMIT: "download.seedRatioLimit",
  SEED_TIME_LIMIT_HOURS: "download.seedTimeLimitHours",
  SEED_CLEANUP_FILES: "download.seedCleanupFiles",

  // Onboarding
  ONBOARDING_COMPLETED: "onboarding.completed",

  // Cache
  CACHE_SPOTLIGHT: "cache.spotlight",
} as const;
