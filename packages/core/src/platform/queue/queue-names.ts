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
  traktListDelete: "trakt-list-delete",
  traktListDeleteSweep: "trakt-list-delete-sweep",
  stallDetection: "stall-detection",
  rssSync: "rss-sync",
  dailyRecsCheck: "daily-recs-check",
  backfillExtras: "backfill-extras",
  seedManagement: "seed-management",
  folderScan: "folder-scan",
  validateDownloads: "validate-downloads",
  repackSupersede: "repack-supersede",
  refreshExtras: "refresh-extras",
  reconcileShow: "reconcile-show",
  rebuildUserRecs: "rebuild-user-recs",
  refreshAllLanguage: "refresh-all-language",
  translateEpisodes: "translate-episodes",
  mediaPipeline: "media-pipeline",
  ensureMedia: "ensure-media",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
