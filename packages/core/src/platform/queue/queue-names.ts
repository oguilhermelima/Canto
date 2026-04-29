/**
 * Canonical queue names. Import `QUEUES.x` instead of sprinkling string
 * literals across the worker, dispatcher, and producers.
 */
export const QUEUES = {
  importTorrents: "import-torrents",
  jellyfinSync: "jellyfin-sync",
  plexSync: "plex-sync",
  reverseSyncFull: "reverse-sync-full",
  reverseSyncUser: "reverse-sync-user",
  traktSync: "trakt-sync",
  traktSyncUser: "trakt-sync-user",
  traktSyncSection: "trakt-sync-section",
  traktListDelete: "trakt-list-delete",
  traktListDeleteSweep: "trakt-list-delete-sweep",
  stallDetection: "stall-detection",
  rssSync: "rss-sync",
  dailyRecsCheck: "daily-recs-check",
  mediaCadenceSweep: "media-cadence-sweep",
  seedManagement: "seed-management",
  folderScan: "folder-scan",
  validateDownloads: "validate-downloads",
  repackSupersede: "repack-supersede",
  refreshExtras: "refresh-extras",
  rebuildUserRecs: "rebuild-user-recs",
  translateEpisodes: "translate-episodes",
  ensureMedia: "ensure-media",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
