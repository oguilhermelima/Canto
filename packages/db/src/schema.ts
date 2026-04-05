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

// ─── Supported Languages ───

export const supportedLanguage = pgTable("supported_language", {
  code: varchar("code", { length: 10 }).primaryKey(), // "en-US", "pt-BR"
  name: varchar("name", { length: 100 }).notNull(), // "English", "Portuguese (Brazil)"
  nativeName: varchar("native_name", { length: 100 }).notNull(), // "English", "Português (Brasil)"
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: varchar("image", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("user"), // 'admin' | 'user'
  language: varchar("language", { length: 10 })
    .notNull()
    .default("en-US")
    .references(() => supportedLanguage.code),
  watchRegion: varchar("watch_region", { length: 10 }),
  directSearchEnabled: boolean("direct_search_enabled").notNull().default(true),
  recsVersion: integer("recs_version").notNull().default(0),
  recsUpdatedAt: timestamp("recs_updated_at", { withTimezone: true }),
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

// ─── Download folder tables ───

export const downloadFolder = pgTable("download_folder", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  /** Where the download client saves files, e.g. "/downloads/anime" */
  downloadPath: varchar("download_path", { length: 500 }),
  /** Where organized media lives, e.g. "/media/anime" */
  libraryPath: varchar("library_path", { length: 500 }),
  /** qBittorrent category name */
  qbitCategory: varchar("qbit_category", { length: 100 }),
  /** Auto-routing rules — evaluated against media metadata to auto-select this folder */
  rules: jsonb("rules").$type<RuleGroup | null>(),
  /** Evaluation order (lower = checked first). More specific rules should have lower priority. */
  priority: integer("priority").notNull().default(0),
  /** Fallback folder when no rules match */
  isDefault: boolean("is_default").notNull().default(false),
  /** Whether this folder accepts downloads */
  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const folderServerLink = pgTable(
  "folder_server_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => downloadFolder.id, { onDelete: "cascade" }),
    /** "jellyfin" | "plex" */
    serverType: varchar("server_type", { length: 20 }).notNull(),
    /** Jellyfin folder ID or Plex section key */
    serverLibraryId: varchar("server_library_id", { length: 100 }).notNull(),
    /** Display name from server */
    serverLibraryName: varchar("server_library_name", { length: 200 }),
    /** Path reported by the server */
    serverPath: varchar("server_path", { length: 500 }),
    /** Whether to import existing media from this link */
    syncEnabled: boolean("sync_enabled").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_folder_server_link").on(
      table.folderId,
      table.serverType,
      table.serverLibraryId,
    ),
  ],
);

// ─── Rule types (used by downloadFolder.rules JSONB) ───

export type RuleCondition =
  | { field: "type"; op: "eq"; value: "movie" | "show" }
  | { field: "genre"; op: "contains_any" | "contains_all"; value: string[] }
  | { field: "genreId"; op: "contains_any" | "contains_all"; value: number[] }
  | { field: "originCountry"; op: "contains_any" | "not_contains_any"; value: string[] }
  | { field: "originalLanguage"; op: "eq" | "neq"; value: string }
  | { field: "contentRating"; op: "eq" | "in"; value: string | string[] }
  | { field: "provider"; op: "eq"; value: "tmdb" | "tvdb" };

export type RuleGroup = {
  operator: "AND" | "OR";
  conditions: Array<RuleCondition | RuleGroup>;
};

/** @deprecated Alias for backward compatibility — use downloadFolder */
export const library = downloadFolder;

// ─── Media tables ───

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 10 }).notNull(), // 'movie' | 'show'
    externalId: integer("external_id").notNull(),
    provider: varchar("provider", { length: 20 }).notNull(), // 'tmdb' | 'tvdb'

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
    genreIds: jsonb("genre_ids").$type<number[]>().default([]),
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
    tvdbId: integer("tvdb_id"),

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
    downloaded: boolean("downloaded").notNull().default(false),
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

    // Processing pipeline status
    processingStatus: varchar("processing_status", { length: 20 }).notNull().default("ready"),

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
    index("idx_media_downloaded").on(table.downloaded),
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
    seasonType: varchar("season_type", { length: 30 }),

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
    absoluteNumber: integer("absolute_number"),
    finaleType: varchar("finale_type", { length: 50 }),

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

// ─── Translations (multi-language support) ───

export const mediaTranslation = pgTable(
  "media_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 })
      .notNull()
      .references(() => supportedLanguage.code),
    title: varchar("title", { length: 500 }),
    overview: text("overview"),
    tagline: varchar("tagline", { length: 500 }),
    posterPath: varchar("poster_path", { length: 255 }),
    logoPath: varchar("logo_path", { length: 255 }),
    trailerKey: varchar("trailer_key", { length: 100 }),
  },
  (table) => [
    uniqueIndex("idx_media_translation_unique").on(table.mediaId, table.language),
    index("idx_media_translation_media").on(table.mediaId),
  ],
);

export const seasonTranslation = pgTable(
  "season_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 })
      .notNull()
      .references(() => supportedLanguage.code),
    name: varchar("name", { length: 200 }),
    overview: text("overview"),
  },
  (table) => [
    uniqueIndex("idx_season_translation_unique").on(table.seasonId, table.language),
    index("idx_season_translation_season").on(table.seasonId),
  ],
);

export const episodeTranslation = pgTable(
  "episode_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 })
      .notNull()
      .references(() => supportedLanguage.code),
    title: varchar("title", { length: 500 }),
    overview: text("overview"),
  },
  (table) => [
    uniqueIndex("idx_episode_translation_unique").on(table.episodeId, table.language),
    index("idx_episode_translation_episode").on(table.episodeId),
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
  importAttempts: integer("import_attempts").notNull().default(0),
  importMethod: varchar("import_method", { length: 10 }),
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

// ─── Media recommendations (junction table) ───

export const mediaRecommendation = pgTable(
  "media_recommendation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    sourceMediaId: uuid("source_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 20 }).notNull().default("recommendation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_media_rec_unique").on(table.mediaId, table.sourceMediaId),
    index("idx_media_rec_source").on(table.sourceMediaId),
    index("idx_media_rec_media").on(table.mediaId),
  ],
);

// ─── User recommendations (per-user links to media) ───

export const userRecommendation = pgTable(
  "user_recommendation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    weight: real("weight").notNull().default(1.0),
    version: integer("version").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_rec_user_media_ver").on(table.userId, table.mediaId, table.version),
    index("idx_user_rec_user_active").on(table.userId, table.active),
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
    language: varchar("language", { length: 10 }),
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

// ─── Lists (per-user watchlist, custom lists, shared server library) ───

export const list = pgTable(
  "list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 }).references(() => user.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 20 }).notNull(), // 'watchlist' | 'custom' | 'server'
    isSystem: boolean("is_system").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_list_user_slug").on(table.userId, table.slug),
    index("idx_list_type").on(table.type),
  ],
);

export const listItem = pgTable(
  "list_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    position: integer("position").notNull().default(0),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("idx_list_item_unique").on(table.listId, table.mediaId),
    index("idx_list_item_media").on(table.mediaId),
  ],
);

// ─── Download Requests (user → admin) ───

export const downloadRequest = pgTable(
  "download_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'downloaded' | 'cancelled'
    note: text("note"),
    adminNote: text("admin_note"),
    resolvedBy: varchar("resolved_by", { length: 36 }).references(
      () => user.id,
      { onDelete: "set null" },
    ),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_request_user").on(table.userId),
    index("idx_request_status").on(table.status),
    uniqueIndex("idx_request_user_media").on(table.userId, table.mediaId),
  ],
);

// ─── Relations ───

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  preferences: many(userPreference),
  lists: many(list),
  downloadRequests: many(downloadRequest),
  recommendations: many(userRecommendation),
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

export const downloadFolderRelations = relations(downloadFolder, ({ many }) => ({
  media: many(media),
  serverLinks: many(folderServerLink),
}));

export const folderServerLinkRelations = relations(folderServerLink, ({ one }) => ({
  folder: one(downloadFolder, {
    fields: [folderServerLink.folderId],
    references: [downloadFolder.id],
  }),
}));

/** @deprecated Use downloadFolderRelations */
export const libraryRelations = downloadFolderRelations;

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
  recommendedBy: many(mediaRecommendation, { relationName: "recommendedMedia" }),
  recommendationsFor: many(mediaRecommendation, { relationName: "sourceMedia" }),
  listItems: many(listItem),
  translations: many(mediaTranslation),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  media: one(media, {
    fields: [season.mediaId],
    references: [media.id],
  }),
  episodes: many(episode),
  translations: many(seasonTranslation),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  season: one(season, {
    fields: [episode.seasonId],
    references: [season.id],
  }),
  files: many(mediaFile),
  translations: many(episodeTranslation),
}));

export const mediaTranslationRelations = relations(mediaTranslation, ({ one }) => ({
  media: one(media, {
    fields: [mediaTranslation.mediaId],
    references: [media.id],
  }),
}));

export const seasonTranslationRelations = relations(seasonTranslation, ({ one }) => ({
  season: one(season, {
    fields: [seasonTranslation.seasonId],
    references: [season.id],
  }),
}));

export const episodeTranslationRelations = relations(episodeTranslation, ({ one }) => ({
  episode: one(episode, {
    fields: [episodeTranslation.episodeId],
    references: [episode.id],
  }),
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

export const mediaRecommendationRelations = relations(
  mediaRecommendation,
  ({ one }) => ({
    media: one(media, {
      fields: [mediaRecommendation.mediaId],
      references: [media.id],
      relationName: "recommendedMedia",
    }),
    sourceMedia: one(media, {
      fields: [mediaRecommendation.sourceMediaId],
      references: [media.id],
      relationName: "sourceMedia",
    }),
  }),
);

export const userRecommendationRelations = relations(
  userRecommendation,
  ({ one }) => ({
    user: one(user, {
      fields: [userRecommendation.userId],
      references: [user.id],
    }),
    media: one(media, {
      fields: [userRecommendation.mediaId],
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

export const listRelations = relations(list, ({ one, many }) => ({
  user: one(user, {
    fields: [list.userId],
    references: [user.id],
  }),
  items: many(listItem),
}));

export const listItemRelations = relations(listItem, ({ one }) => ({
  list: one(list, {
    fields: [listItem.listId],
    references: [list.id],
  }),
  media: one(media, {
    fields: [listItem.mediaId],
    references: [media.id],
  }),
}));

export const downloadRequestRelations = relations(
  downloadRequest,
  ({ one }) => ({
    user: one(user, {
      fields: [downloadRequest.userId],
      references: [user.id],
    }),
    media: one(media, {
      fields: [downloadRequest.mediaId],
      references: [media.id],
    }),
  }),
);
