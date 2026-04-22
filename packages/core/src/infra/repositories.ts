// Aggregate repository barrel. Preserved temporarily to keep the transitional
// code working until Phase 6 refactors composition roots to consume ports.
// New code should import from specific repositories under infra/<context>/.

export * from "./content-enrichment/extras-repository";

export * from "./file-organization/folder-repository";
export * from "./file-organization/library-repository";

export * from "./lists/list-repository";
export * from "./lists/member-repository";

export * from "./media/media-repository";
export * from "./media/media-version-repository";
export * from "./media/media-file-repository";

export * from "./media-servers/user-connection-repository";

export * from "./notifications/notification-repository";
export * from "./notifications/notification-aggregate-repository";

export * from "./profile/home-section-repository";
export * from "./profile/home-section-aggregate-repository";
export * from "./profile/profile-section-repository";
export * from "./profile/profile-section-aggregate-repository";

export * from "./recommendations/user-recommendation-repository";

export * from "./requests/request-repository";
export * from "./requests/request-aggregate-repository";

export * from "./shared/language-repository";

export * from "./torrents/torrent-repository";

export * from "./trakt/trakt-sync-repository";
export * from "./trakt/trakt-sync-aggregate-repository";

export * from "./user/user-repository";
export * from "./user/user-aggregate-repository";

export * from "./user-media/hidden-repository";
export * from "./user-media/library-feed-repository";
export * from "./user-media/library-repository";
export * from "./user-media/playback-progress-repository";
export * from "./user-media/profile-insights-repository";
export * from "./user-media/rating-repository";
export * from "./user-media/state-repository";
export * from "./user-media/stats-repository";
export * from "./user-media/watch-history-repository";
