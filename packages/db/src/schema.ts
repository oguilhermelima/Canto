import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Auth tables (better-auth compatible) ───

export const user = pgTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: varchar("image", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("user"), // 'admin' | 'user'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: varchar("id", { length: 36 }).primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: varchar("scope", { length: 255 }),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── User Preferences ───

export const userPreference = pgTable("user_preference", {
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  value: jsonb("value").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.key] }),
]);

// ─── System Settings (key-value, global config) ───

export const systemSetting = pgTable("system_setting", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Library tables ───

export const library = pgTable("library", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  /** "movies" | "shows" | "animes" */
  type: varchar("type", { length: 20 }).notNull(),
  /** Organized media destination on host, e.g. "/home/user/Medias/Movies" */
  mediaPath: varchar("media_path", { length: 500 }),
  /** Same path as seen from qBit container, e.g. "/medias/Movies" */
  containerMediaPath: varchar("container_media_path", { length: 500 }),
  /** qBittorrent category name, e.g. "movies" */
  qbitCategory: varchar("qbit_category", { length: 100 }),
  /** Jellyfin library ID (unique per server) */
  jellyfinLibraryId: varchar("jellyfin_library_id", { length: 100 }).unique(),
  /** Path inside Jellyfin container, e.g. "/media/Movies" */
  jellyfinPath: varchar("jellyfin_path", { length: 500 }),
  /** Plex library section ID */
  plexLibraryId: varchar("plex_library_id", { length: 100 }),
  /** Whether this is the default library for its type */
  isDefault: boolean("is_default").notNull().default(false),
  /** Whether this library is enabled for downloads */
  enabled: boolean("enabled").notNull().default(true),
  /** Whether to import media from this library during sync */
  syncEnabled: boolean("sync_enabled").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Media tables ───

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 10 }).notNull(), // 'movie' | 'show'
    externalId: integer("external_id").notNull(),
    provider: varchar("provider", { length: 20 }).notNull(), // 'tmdb' | 'anilist' | 'tvdb'

    // Identity
    title: varchar("title", { length: 500 }).notNull(),
    originalTitle: varchar("original_title", { length: 500 }),
    overview: text("overview"),
    tagline: varchar("tagline", { length: 500 }),

    // Dates
    releaseDate: date("release_date"),
    year: integer("year"),
    lastAirDate: date("last_air_date"),

    // Classification
    status: varchar("status", { length: 50 }),
    genres: jsonb("genres").$type<string[]>().default([]),
    contentRating: varchar("content_rating", { length: 20 }),
    originalLanguage: varchar("original_language", { length: 10 }),
    spokenLanguages: jsonb("spoken_languages").$type<string[]>(),
    originCountry: jsonb("origin_country").$type<string[]>(),

    // Metrics
    voteAverage: real("vote_average"),
    voteCount: integer("vote_count"),
    popularity: real("popularity"),
    runtime: integer("runtime"),

    // Images
    posterPath: varchar("poster_path", { length: 255 }),
    backdropPath: varchar("backdrop_path", { length: 255 }),
    logoPath: varchar("logo_path", { length: 255 }),

    // External IDs
    imdbId: varchar("imdb_id", { length: 20 }),
    anilistId: integer("anilist_id"),
    anilistScore: real("anilist_score"),

    // TV-specific
    numberOfSeasons: integer("number_of_seasons"),
    numberOfEpisodes: integer("number_of_episodes"),
    inProduction: boolean("in_production"),
    networks: jsonb("networks").$type<string[]>(),

    // Movie-specific
    budget: bigint("budget", { mode: "number" }),
    revenue: bigint("revenue", { mode: "number" }),
    collection: jsonb("collection").$type<{
      id: number;
      name: string;
      posterPath?: string;
    } | null>(),

    // Production
    productionCompanies:
      jsonb("production_companies").$type<
        { id: number; name: string; logoPath?: string }[]
      >(),
    productionCountries: jsonb("production_countries").$type<string[]>(),

    // Library state
    libraryId: uuid("library_id").references(() => library.id, {
      onDelete: "set null",
    }),
    inLibrary: boolean("in_library").notNull().default(false),
    libraryPath: varchar("library_path", { length: 500 }),
    addedAt: timestamp("added_at", { withTimezone: true }),
    continuousDownload: boolean("continuous_download").notNull().default(false),

    // Refresh strategy
    nextAirDate: date("next_air_date"),
    extrasUpdatedAt: timestamp("extras_updated_at", { withTimezone: true }),
    qualityProfileId: uuid("quality_profile_id").references(
      () => qualityProfile.id,
      { onDelete: "set null" },
    ),

    // Timestamps
    metadataUpdatedAt: timestamp("metadata_updated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_media_external").on(table.externalId, table.provider),
    index("idx_media_type").on(table.type),
    index("idx_media_in_library").on(table.inLibrary),
    index("idx_media_provider").on(table.provider, table.externalId),
  ],
);

export const season = pgTable(
  "season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    externalId: integer("external_id"),
    name: varchar("name", { length: 255 }),
    overview: text("overview"),
    airDate: date("air_date"),
    posterPath: varchar("poster_path", { length: 255 }),
    episodeCount: integer("episode_count"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_season_media_number").on(table.mediaId, table.number),
  ],
);

export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    externalId: integer("external_id"),
    title: varchar("title", { length: 500 }),
    overview: text("overview"),
    airDate: date("air_date"),
    runtime: integer("runtime"),
    stillPath: varchar("still_path", { length: 255 }),
    voteAverage: real("vote_average"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_episode_season_number").on(table.seasonId, table.number),
  ],
);

export const torrent = pgTable("torrent", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
  hash: varchar("hash", { length: 100 }).unique(),
  title: varchar("title", { length: 500 }).notNull(),
  /** "movie" | "season" | "episode" */
  downloadType: varchar("download_type", { length: 20 }).notNull().default("movie"),
  seasonNumber: integer("season_number"),
  episodeNumbers: jsonb("episode_numbers").$type<number[]>(),
  status: varchar("status", { length: 20 }).notNull().default("unknown"),
  quality: varchar("quality", { length: 20 }).notNull().default("unknown"),
  source: varchar("source", { length: 20 }).notNull().default("unknown"),
  progress: real("progress").notNull().default(0),
  contentPath: varchar("content_path", { length: 1000 }),
  fileSize: bigint("file_size", { mode: "number" }),
  magnetUrl: text("magnet_url"),
  downloadUrl: text("download_url"),
  imported: boolean("imported").notNull().default(false),
  importing: boolean("importing").notNull().default(false),
  usenet: boolean("usenet").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mediaFile = pgTable(
  "media_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    torrentId: uuid("torrent_id").references(() => torrent.id, {
      onDelete: "set null",
    }),
    filePath: varchar("file_path", { length: 1000 }).notNull(),
    quality: varchar("quality", { length: 20 }).default("unknown"),
    source: varchar("source", { length: 20 }).default("unknown"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_media_file_media").on(table.mediaId),
    index("idx_media_file_torrent").on(table.torrentId),
  ],
);

export const extrasCache = pgTable("extras_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" })
    .unique(),
  data: jsonb("data").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Sync items (reverse sync from Jellyfin/Plex) ───

export const syncItem = pgTable(
  "sync_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    serverItemTitle: varchar("server_item_title", { length: 500 }).notNull(),
    serverItemPath: varchar("server_item_path", { length: 1000 }),
    serverItemYear: integer("server_item_year"),
    tmdbId: integer("tmdb_id"),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    result: varchar("result", { length: 20 }).notNull(), // imported | skipped | failed
    reason: varchar("reason", { length: 500 }),
    /** Which server this item came from */
    source: varchar("source", { length: 20 }), // jellyfin | plex
    /** Jellyfin internal item ID for deep linking */
    jellyfinItemId: varchar("jellyfin_item_id", { length: 100 }),
    /** Plex rating key for deep linking */
    plexRatingKey: varchar("plex_rating_key", { length: 100 }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sync_item_library").on(table.libraryId),
    index("idx_sync_item_result").on(table.result),
  ],
);

// ─── Sync episode details (media files from Jellyfin/Plex) ───

export const syncEpisode = pgTable(
  "sync_episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncItemId: uuid("sync_item_id")
      .notNull()
      .references(() => syncItem.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    serverEpisodeId: varchar("server_episode_id", { length: 100 }),
    resolution: varchar("resolution", { length: 10 }), // 4K, 1080p, 720p, SD
    videoCodec: varchar("video_codec", { length: 20 }),
    audioCodec: varchar("audio_codec", { length: 20 }),
    container: varchar("container", { length: 10 }),
    fileSize: bigint("file_size", { mode: "number" }),
    filePath: varchar("file_path", { length: 1000 }),
  },
  (table) => [
    index("idx_sync_episode_item").on(table.syncItemId),
  ],
);

// ─── Watch provider search links ───

export const watchProviderLink = pgTable("watch_provider_link", {
  providerId: integer("provider_id").primaryKey(),
  providerName: varchar("provider_name", { length: 200 }).notNull(),
  searchUrlTemplate: text("search_url_template"),
});

// ─── Quality profiles ───

export const qualityProfile = pgTable("quality_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  qualities: jsonb("qualities").$type<string[]>().notNull(),
  cutoff: varchar("cutoff", { length: 50 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Recommendation pool ───

export const recommendationPool = pgTable(
  "recommendation_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: varchar("media_type", { length: 10 }).notNull(),
    sourceMediaId: uuid("source_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    overview: text("overview"),
    posterPath: varchar("poster_path", { length: 255 }),
    backdropPath: varchar("backdrop_path", { length: 255 }),
    logoPath: varchar("logo_path", { length: 255 }),
    releaseDate: date("release_date"),
    voteAverage: real("vote_average"),
    score: real("score").notNull().default(0),
    frequency: integer("frequency").notNull().default(1),
    sourceType: varchar("source_type", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_rec_pool_source").on(table.sourceMediaId),
    index("idx_rec_pool_tmdb").on(table.tmdbId, table.mediaType),
    index("idx_rec_pool_score").on(table.score),
  ],
);

// ─── Media credits (replaces extrasCache credits) ───

export const mediaCredit = pgTable(
  "media_credit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    character: varchar("character", { length: 500 }),
    department: varchar("department", { length: 100 }),
    job: varchar("job", { length: 100 }),
    profilePath: varchar("profile_path", { length: 255 }),
    type: varchar("type", { length: 10 }).notNull(),
    order: integer("order").notNull().default(0),
  },
  (table) => [index("idx_credit_media").on(table.mediaId)],
);

// ─── Media videos (replaces extrasCache videos) ───

export const mediaVideo = pgTable(
  "media_video",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    externalKey: varchar("external_key", { length: 255 }).notNull(),
    site: varchar("site", { length: 50 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    official: boolean("official").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [index("idx_video_media").on(table.mediaId)],
);

// ─── Media watch providers (replaces extrasCache watchProviders) ───

export const mediaWatchProvider = pgTable(
  "media_watch_provider",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    providerId: integer("provider_id").notNull(),
    providerName: varchar("provider_name", { length: 255 }).notNull(),
    logoPath: varchar("logo_path", { length: 255 }),
    type: varchar("type", { length: 10 }).notNull(),
    region: varchar("region", { length: 10 }).notNull(),
  },
  (table) => [
    index("idx_wp_media").on(table.mediaId),
    index("idx_wp_region").on(table.region),
  ],
);

// ─── Notifications ───

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  read: boolean("read").notNull().default(false),
  mediaId: uuid("media_id").references(() => media.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Blocklist (failed downloads) ───

export const blocklist = pgTable(
  "blocklist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    indexer: varchar("indexer", { length: 100 }),
    reason: varchar("reason", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_blocklist_media").on(table.mediaId)],
);

// ─── Relations ───

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  preferences: many(userPreference),
}));

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, {
    fields: [userPreference.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const libraryRelations = relations(library, ({ many }) => ({
  media: many(media),
}));

export const mediaRelations = relations(media, ({ many, one }) => ({
  library: one(library, {
    fields: [media.libraryId],
    references: [library.id],
  }),
  qualityProfile: one(qualityProfile, {
    fields: [media.qualityProfileId],
    references: [qualityProfile.id],
  }),
  seasons: many(season),
  files: many(mediaFile),
  credits: many(mediaCredit),
  videos: many(mediaVideo),
  watchProviders: many(mediaWatchProvider),
  recommendations: many(recommendationPool),
  extrasCache: one(extrasCache, {
    fields: [media.id],
    references: [extrasCache.mediaId],
  }),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  media: one(media, {
    fields: [season.mediaId],
    references: [media.id],
  }),
  episodes: many(episode),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  season: one(season, {
    fields: [episode.seasonId],
    references: [season.id],
  }),
  files: many(mediaFile),
}));

export const torrentRelations = relations(torrent, ({ many }) => ({
  files: many(mediaFile),
}));

export const mediaFileRelations = relations(mediaFile, ({ one }) => ({
  media: one(media, {
    fields: [mediaFile.mediaId],
    references: [media.id],
  }),
  episode: one(episode, {
    fields: [mediaFile.episodeId],
    references: [episode.id],
  }),
  torrent: one(torrent, {
    fields: [mediaFile.torrentId],
    references: [torrent.id],
  }),
}));

export const extrasCacheRelations = relations(extrasCache, ({ one }) => ({
  media: one(media, {
    fields: [extrasCache.mediaId],
    references: [media.id],
  }),
}));

export const syncItemRelations = relations(syncItem, ({ one, many }) => ({
  library: one(library, {
    fields: [syncItem.libraryId],
    references: [library.id],
  }),
  media: one(media, {
    fields: [syncItem.mediaId],
    references: [media.id],
  }),
  episodes: many(syncEpisode),
}));

export const syncEpisodeRelations = relations(syncEpisode, ({ one }) => ({
  syncItem: one(syncItem, {
    fields: [syncEpisode.syncItemId],
    references: [syncItem.id],
  }),
}));

export const qualityProfileRelations = relations(qualityProfile, ({ many }) => ({
  media: many(media),
}));

export const recommendationPoolRelations = relations(
  recommendationPool,
  ({ one }) => ({
    sourceMedia: one(media, {
      fields: [recommendationPool.sourceMediaId],
      references: [media.id],
    }),
  }),
);

export const mediaCreditRelations = relations(mediaCredit, ({ one }) => ({
  media: one(media, {
    fields: [mediaCredit.mediaId],
    references: [media.id],
  }),
}));

export const mediaVideoRelations = relations(mediaVideo, ({ one }) => ({
  media: one(media, {
    fields: [mediaVideo.mediaId],
    references: [media.id],
  }),
}));

export const mediaWatchProviderRelations = relations(
  mediaWatchProvider,
  ({ one }) => ({
    media: one(media, {
      fields: [mediaWatchProvider.mediaId],
      references: [media.id],
    }),
  }),
);

export const notificationRelations = relations(notification, ({ one }) => ({
  media: one(media, {
    fields: [notification.mediaId],
    references: [media.id],
  }),
}));

export const blocklistRelations = relations(blocklist, ({ one }) => ({
  media: one(media, {
    fields: [blocklist.mediaId],
    references: [media.id],
  }),
}));
