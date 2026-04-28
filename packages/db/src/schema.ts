import { relations, sql } from "drizzle-orm";
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
  image: text("image"),
  role: varchar("role", { length: 20 }).notNull().default("user"), // 'admin' | 'user'
  language: varchar("language", { length: 10 })
    .notNull()
    .default("en-US")
    .references(() => supportedLanguage.code),
  watchRegion: varchar("watch_region", { length: 10 }),
  isPublic: boolean("is_public").notNull().default(false),
  bio: varchar("bio", { length: 500 }),
  headerImage: text("header_image"),
  directSearchEnabled: boolean("direct_search_enabled").notNull().default(true),
  recsVersion: integer("recs_version").notNull().default(0),
  recsUpdatedAt: timestamp("recs_updated_at", { withTimezone: true }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
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
  /** Auto-routing rules — evaluated against media metadata to auto-select this folder.
   *  Stored as JSONB; may hold either the current `RoutingRules` shape or the legacy
   *  `RuleGroup` shape for rows written before the refactor. Readers normalize via
   *  `normalizeFolderRules` in `@canto/core/domain/rules/folder-routing`. */
  rules: jsonb("rules").$type<PersistedFolderRules | null>(),
  /** Evaluation order (lower = checked first). More specific rules should have lower priority. */
  priority: integer("priority").notNull().default(0),
  /** Fallback folder when no rules match */
  isDefault: boolean("is_default").notNull().default(false),
  /** Whether this folder accepts downloads */
  enabled: boolean("enabled").notNull().default(true),
  /** Default download profile applied to media that lands in this folder
   *  via routing. Snapshotted onto media.downloadProfileId at add-time. */
  downloadProfileId: uuid("download_profile_id").references(
    () => downloadProfile.id,
    { onDelete: "set null" },
  ),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const folderMediaPath = pgTable(
  "folder_media_path",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => downloadFolder.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 500 }).notNull(),
    label: varchar("label", { length: 100 }),
    source: varchar("source", { length: 20 }).default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_folder_media_path").on(table.folderId, table.path),
    index("idx_folder_media_path_folder").on(table.folderId),
  ],
);

export const folderServerLink = pgTable(
  "folder_server_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The user connection this link belongs to (null if global admin link) */
    userConnectionId: uuid("user_connection_id").references(() => userConnection.id, { onDelete: "cascade" }),
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
    /** "movies" | "shows" */
    contentType: varchar("content_type", { length: 20 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_server_link_library_user").on(
      table.serverType,
      table.serverLibraryId,
      table.userConnectionId,
    ),
  ],
);

// ─── Home Section types (used by homeSection.config JSONB) ───

export interface TmdbSectionConfig {
  type?: "movie" | "show";
  mode?: "trending" | "discover";
  genres?: string;
  language?: string;
  sortBy?: string;
  dateFrom?: string;
  dateTo?: string;
  keywords?: string;
  scoreMin?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  certification?: string;
  status?: string;
  watchProviders?: string;
  watchRegion?: string;
}

export interface DbSectionConfig {
  mediaType?: "movie" | "show";
  limit?: number;
  listId?: string;
}

export type HomeSectionConfig = TmdbSectionConfig | DbSectionConfig;

// ─── Home Sections (per-user homepage layout) ───

export const homeSection = pgTable(
  "home_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    style: varchar("style", { length: 20 }).notNull(), // spotlight | large_video | card | cover
    sourceType: varchar("source_type", { length: 10 }).notNull(), // db | tmdb
    sourceKey: varchar("source_key", { length: 50 }).notNull(),
    config: jsonb("config").$type<HomeSectionConfig>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_home_section_user").on(table.userId),
    uniqueIndex("uq_home_section_user_position").on(table.userId, table.position),
  ],
);

// ─── Profile Sections (per-user profile layout) ───

export type ProfileSectionConfig = {
  widgets?: string[];
};

export const profileSection = pgTable(
  "profile_section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    sectionKey: varchar("section_key", { length: 50 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    config: jsonb("config").$type<ProfileSectionConfig>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_profile_section_user").on(table.userId),
    uniqueIndex("uq_profile_section_user_position").on(table.userId, table.position),
  ],
);

// ─── Rule types (used by downloadFolder.rules JSONB) ───

export type RuleCondition =
  | { field: "type"; op: "eq"; value: "movie" | "show" }
  | { field: "genre"; op: "contains_any" | "contains_all" | "not_contains_any"; value: string[] }
  | { field: "genreId"; op: "contains_any" | "contains_all" | "not_contains_any"; value: number[] }
  | { field: "originCountry"; op: "contains_any" | "not_contains_any"; value: string[] }
  | { field: "originalLanguage"; op: "eq" | "neq"; value: string }
  | { field: "contentRating"; op: "eq" | "in"; value: string | string[] }
  | { field: "provider"; op: "eq"; value: "tmdb" | "tvdb" }
  | { field: "year"; op: "eq" | "gte" | "lte"; value: number }
  | { field: "runtime"; op: "gte" | "lte"; value: number }
  | { field: "voteAverage"; op: "gte" | "lte"; value: number }
  | { field: "status"; op: "eq" | "in"; value: string | string[] }
  | { field: "watchProvider"; op: "contains_any" | "not_contains_any"; value: { region: string; providers: number[] } };

/** Current shape: folder matches when ANY rule matches; a rule matches when include all-pass and exclude doesn't all-match. */
export type RoutingRule = {
  include: RuleCondition[];
  exclude?: RuleCondition[];
};

export type RoutingRules = {
  rules: RoutingRule[];
};

/** @deprecated Pre-refactor recursive AND/OR group. Kept so we can migrate stored data on read. */
export type RuleGroup = {
  operator: "AND" | "OR";
  conditions: Array<RuleCondition | RuleGroup>;
};

/** Union of both shapes — what may actually live in the JSONB column after the refactor. */
export type PersistedFolderRules = RoutingRules | RuleGroup;


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

    // Per-media provider override (null = follow global setting)
    overrideProviderFor: varchar("override_provider_for", { length: 20 }),

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
    libraryId: uuid("library_id").references(() => downloadFolder.id, {
      onDelete: "set null",
    }),
    inLibrary: boolean("in_library").notNull().default(false),
    downloaded: boolean("downloaded").notNull().default(false),
    libraryPath: varchar("library_path", { length: 500 }),
    addedAt: timestamp("added_at", { withTimezone: true }),
    continuousDownload: boolean("continuous_download").notNull().default(false),

    // Refresh strategy
    nextAirDate: date("next_air_date"),
    extrasUpdatedAt: timestamp("extras_updated_at", { withTimezone: true }),
    downloadProfileId: uuid("download_profile_id").references(
      () => downloadProfile.id,
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
    uniqueIndex("idx_media_external").on(table.externalId, table.provider, table.type),
    index("idx_media_type").on(table.type),
    // Partial boolean indexes — `in_library=true` and `downloaded=true` are
    // the sole query shapes; a full btree on the boolean columns is 100%
    // skew toward false, so Postgres ignores it. Partial indexes stay tiny
    // and let library/download queries do an index-only scan.
    index("idx_media_in_library").on(table.id).where(sql`${table.inLibrary} = true`),
    index("idx_media_downloaded").on(table.id).where(sql`${table.downloaded} = true`),
    index("idx_media_provider").on(table.provider, table.externalId),
    // Partial index for the spotlight pool (`findRecommendedMediaWithBackdrops`).
    // The filter trims the seq scan from ~60k to ~38k, and release_date DESC
    // lets the query finish with an index-only scan.
    index("idx_media_rec_enriched")
      .on(sql`${table.releaseDate} DESC`)
      .where(sql`${table.metadataUpdatedAt} IS NOT NULL AND ${table.backdropPath} IS NOT NULL`),
    // Functional index that matches the Bayesian weighted-score ORDER BY in
    // `findGlobalRecommendations`. Without this the sort forces a full seq
    // scan + in-memory sort (~2.4s); with it, Postgres does an index scan
    // and finishes in single-digit milliseconds.
    index("idx_media_rec_score")
      .on(
        sql`((${table.voteCount}::numeric * ${table.voteAverage}::numeric + 650.0) / (${table.voteCount}::numeric + 100)) DESC`,
      )
      .where(
        sql`${table.metadataUpdatedAt} IS NOT NULL AND ${table.posterPath} IS NOT NULL AND ${table.voteCount} >= 50`,
      ),
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
    voteAverage: real("vote_average"),

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
    voteCount: integer("vote_count"),
    absoluteNumber: integer("absolute_number"),
    finaleType: varchar("finale_type", { length: 50 }),
    episodeType: varchar("episode_type", { length: 30 }),
    crew: jsonb("crew").$type<Array<{ name: string; job: string; department?: string; profilePath?: string }>>(),
    guestStars: jsonb("guest_stars").$type<Array<{ name: string; character?: string; profilePath?: string }>>(),

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

export const mediaContentRating = pgTable(
  "media_content_rating",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    region: varchar("region", { length: 10 }).notNull(),
    rating: varchar("rating", { length: 50 }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_media_content_rating_unique").on(table.mediaId, table.region),
    index("idx_media_content_rating_media").on(table.mediaId),
  ],
);

/**
 * Catalog of valid certifications per region, mirrored from TMDB's
 * `/certification/{type}/list`. Cached so the filter sidebar can render
 * region-correct options without hitting TMDB on every request.
 */
export const tmdbCertification = pgTable(
  "tmdb_certification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 10 }).notNull(), // 'movie' | 'tv'
    region: varchar("region", { length: 10 }).notNull(),
    rating: varchar("rating", { length: 50 }).notNull(),
    meaning: text("meaning"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_tmdb_certification_unique").on(table.type, table.region, table.rating),
    index("idx_tmdb_certification_type_region").on(table.type, table.region),
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
  /** Repack/proper count parsed from the title at download time. 0 = not
   *  a repack. Higher counts (REPACK2, PROPER3) supersede lower; the
   *  future auto-supersede job uses this to decide whether to replace. */
  repackCount: integer("repack_count").notNull().default(0),

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

// ─── Media versions (one row per observed file on Jellyfin/Plex) ───

export const mediaVersion = pgTable(
  "media_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    source: varchar("source", { length: 20 }).notNull(), // jellyfin | plex
    serverLinkId: uuid("server_link_id")
      .references(() => folderServerLink.id, { onDelete: "set null" }),
    serverItemId: varchar("server_item_id", { length: 100 }).notNull(),
    serverItemTitle: varchar("server_item_title", { length: 500 }).notNull(),
    serverItemPath: varchar("server_item_path", { length: 1000 }),
    serverItemYear: integer("server_item_year"),
    resolution: varchar("resolution", { length: 10 }),
    videoCodec: varchar("video_codec", { length: 20 }),
    audioCodec: varchar("audio_codec", { length: 20 }),
    container: varchar("container", { length: 10 }),
    fileSize: bigint("file_size", { mode: "number" }),
    bitrate: bigint("bitrate", { mode: "number" }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    hdr: varchar("hdr", { length: 20 }),
    primaryAudioLang: varchar("primary_audio_lang", { length: 10 }),
    audioLangs: text("audio_langs").array(),
    subtitleLangs: text("subtitle_langs").array(),
    tmdbId: integer("tmdb_id"),
    result: varchar("result", { length: 20 }).notNull(), // imported | skipped | unmatched | failed
    reason: varchar("reason", { length: 500 }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_media_version_source_server_item").on(
      table.source,
      table.serverItemId,
    ),
    index("idx_media_version_media").on(table.mediaId),
    index("idx_media_version_result").on(table.result),
    index("idx_media_version_server_link").on(table.serverLinkId),
  ],
);

// ─── Media version episode details (per-episode file metadata) ───

export const mediaVersionEpisode = pgTable(
  "media_version_episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => mediaVersion.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    serverEpisodeId: varchar("server_episode_id", { length: 100 }),
    resolution: varchar("resolution", { length: 10 }),
    videoCodec: varchar("video_codec", { length: 20 }),
    audioCodec: varchar("audio_codec", { length: 20 }),
    container: varchar("container", { length: 10 }),
    fileSize: bigint("file_size", { mode: "number" }),
    bitrate: bigint("bitrate", { mode: "number" }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    hdr: varchar("hdr", { length: 20 }),
    primaryAudioLang: varchar("primary_audio_lang", { length: 10 }),
    audioLangs: text("audio_langs").array(),
    subtitleLangs: text("subtitle_langs").array(),
    filePath: varchar("file_path", { length: 1000 }),
  },
  (table) => [
    index("idx_media_version_episode_version").on(table.versionId),
  ],
);

// ─── Watch provider search links ───

export const watchProviderLink = pgTable("watch_provider_link", {
  providerId: integer("provider_id").primaryKey(),
  providerName: varchar("provider_name", { length: 200 }).notNull(),
  searchUrlTemplate: text("search_url_template"),
});

// ─── Download profiles ───

/**
 * One entry in {@link downloadProfile.allowedFormats}. Each entry expresses
 * "this (quality, source) combo is acceptable, and this is its base
 * weight in the score". Higher weight = more preferred. Entries are
 * order-independent; weight is the source of truth.
 */
export type DownloadProfileAllowedFormat = {
  quality: string;
  source: string;
  weight: number;
};

export const downloadProfile = pgTable("download_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  /** Which media flavor this profile may be assigned to. */
  flavor: varchar("flavor", { length: 10 }).notNull(),
  /** Acceptable (quality, source) combos with their base weights. Releases
   *  whose (quality, source) is not in this list are rejected by the
   *  scoring engine. */
  allowedFormats: jsonb("allowed_formats")
    .$type<DownloadProfileAllowedFormat[]>()
    .notNull(),
  /** Cutoff combo. Releases at or above the cutoff don't trigger upgrade
   *  searches. Both columns are null when the profile has no cutoff. */
  cutoffQuality: varchar("cutoff_quality", { length: 20 }),
  cutoffSource: varchar("cutoff_source", { length: 20 }),
  /** Minimum total (profile + bonuses) score for a release to be kept.
   *  Defaults to 0 = no filter beyond the allowedFormats whitelist. */
  minTotalScore: integer("min_total_score").notNull().default(0),
  /** One default per flavor. Used as the fallback when neither a media
   *  nor its folder has an explicit profile. */
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Download admin config (single-row, system-wide) ───

/**
 * Server-wide download knobs. Holds the scoring rule blob plus
 * admin-level preferences that apply to every download decision
 * regardless of which user triggered the search. Editions and AV1 stance
 * are admin policy (which edition the household downloads, what codec
 * the playback infra supports), not per-user taste — those live here.
 *
 * Single-row table. Repository upserts the row by id, defaulting to a
 * fixed sentinel when no row exists yet.
 */
export const downloadConfig = pgTable("download_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Full {@link ScoringRules} blob from `@canto/core`. Validated on read
   *  via Zod in the repository — typed `unknown` here to keep the schema
   *  package free of core imports. */
  scoringRules: jsonb("scoring_rules").$type<Record<string, unknown>>().notNull(),
  /** Editions to boost (e.g. ["IMAX", "Extended"]). */
  preferredEditions: jsonb("preferred_editions").$type<string[]>().notNull().default([]),
  /** Editions to penalise (e.g. ["Theatrical"]). */
  avoidedEditions: jsonb("avoided_editions").$type<string[]>().notNull().default([]),
  /** "neutral" | "prefer" | "avoid" — applied to the AV1 codec entries. */
  av1Stance: varchar("av1_stance", { length: 10 }).notNull().default("neutral"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Curated release-group tiers (system-wide, per flavor) ───

/**
 * Release-group classification. PK is `(name_lower, flavor)` so the same
 * group can carry different tiers across flavors (NTb is movie-tier1 +
 * show-tier1 but absent from anime). `name_lower` is the lowercased
 * lookup form; `displayName` preserves the canonical casing for admin UI.
 *
 * "neutral" is implicit (= group not in this table). Only tier1/tier2/
 * tier3/avoid rows live here.
 */
export const downloadReleaseGroup = pgTable(
  "download_release_group",
  {
    nameLower: varchar("name_lower", { length: 100 }).notNull(),
    flavor: varchar("flavor", { length: 10 }).notNull(),
    tier: varchar("tier", { length: 10 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.nameLower, table.flavor] }),
    index("idx_download_release_group_flavor_tier").on(table.flavor, table.tier),
  ],
);

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

    // ─── Denormalized media columns (perf) ──────────────────────────────
    // Populated by `rebuildUserRecommendations` / `upsertUserRecommendations`.
    // All nullable to allow gradual backfill of pre-existing rows; the daily
    // safety-net rebuild in `enqueueDailyRecsRebuild` self-heals stale users
    // within 24h. `findUserRecommendations` filters out rows whose `title` is
    // null (proxy for "not yet backfilled").
    externalId: integer("external_id"),
    provider: varchar("provider", { length: 20 }),
    type: varchar("type", { length: 10 }),
    title: varchar("title", { length: 500 }),
    overview: text("overview"),
    posterPath: varchar("poster_path", { length: 255 }),
    backdropPath: varchar("backdrop_path", { length: 255 }),
    logoPath: varchar("logo_path", { length: 255 }),
    voteAverage: real("vote_average"),
    year: integer("year"),
    releaseDate: date("release_date"),
    genres: jsonb("genres").$type<string[]>(),
    genreIds: jsonb("genre_ids").$type<number[]>(),
    runtime: integer("runtime"),
    originalLanguage: varchar("original_language", { length: 10 }),
    contentRating: varchar("content_rating", { length: 20 }),
    status: varchar("status", { length: 50 }),
    popularity: real("popularity"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_rec_user_media_ver").on(table.userId, table.mediaId, table.version),
    index("idx_user_rec_user_active").on(table.userId, table.active),
    // Hot read-path: `findUserRecommendations` filters by (userId, active) and
    // sorts by `weight DESC`. The composite covers both halves so Postgres can
    // do an index scan + early-stop limit instead of a heap sort.
    index("idx_user_rec_hot").on(table.userId, table.active, sql`${table.weight} DESC`),
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
  (table) => [
    index("idx_video_media").on(table.mediaId),
    // Powers the trailer-key batch lookup (`findTrailerKeysForMediaIds`) used
    // after the main media-list query. Replaces the per-row correlated
    // subquery that previously lived inside `mediaI18n.trailerKey`.
    index("idx_video_media_type_site").on(table.mediaId, table.type, table.site),
  ],
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
    visibility: varchar("visibility", { length: 20 }).notNull().default("private"), // 'public' | 'private' | 'shared'
    isSystem: boolean("is_system").notNull().default(false),
    position: integer("position").notNull().default(0),
    // Per-collection configuration knobs surfaced in EditCollectionDialog.
    defaultSortBy: varchar("default_sort_by", { length: 50 })
      .notNull()
      .default("date_added.desc"),
    groupByStatus: boolean("group_by_status").notNull().default(false),
    hideCompleted: boolean("hide_completed").notNull().default(false),
    hideDropped: boolean("hide_dropped").notNull().default(false),
    showHidden: boolean("show_hidden").notNull().default(false),
    // Tombstone for Trakt-linked lists awaiting remote deletion. Local row
    // survives until the worker confirms Trakt removed the list, otherwise an
    // orphaned remote list re-imports as an empty local list on next sync.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    index("idx_list_pending_delete").on(table.deletedAt),
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

// ─── List Members (multi-user collaboration) ───

export const listMember = pgTable(
  "list_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("viewer"), // 'viewer' | 'editor' | 'admin'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_list_member_unique").on(table.listId, table.userId),
    index("idx_list_member_user").on(table.userId),
  ],
);

export const listInvitation = pgTable(
  "list_invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    invitedBy: varchar("invited_by", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedEmail: varchar("invited_email", { length: 255 }),
    invitedUserId: varchar("invited_user_id", { length: 36 }).references(
      () => user.id,
      { onDelete: "cascade" },
    ),
    role: varchar("role", { length: 20 }).notNull().default("viewer"), // 'viewer' | 'editor' | 'admin'
    token: varchar("token", { length: 64 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'accepted' | 'rejected' | 'expired'
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_list_invitation_list").on(table.listId),
    index("idx_list_invitation_token").on(table.token),
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

// ─── User Media Library (per-user server library ownership) ───
// Tracks which media items a user has in their Jellyfin/Plex library.
// Prevents duplicating media rows per user — media is shared, ownership is tracked here.

export const userMediaLibrary = pgTable(
  "user_media_library",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 20 }).notNull(), // 'jellyfin' | 'plex'
    serverLinkId: uuid("server_link_id").references(() => folderServerLink.id, {
      onDelete: "set null",
    }),
    serverItemId: varchar("server_item_id", { length: 255 }), // jellyfinItemId or plexRatingKey
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_media_library_unique").on(table.userId, table.mediaId, table.source),
    index("idx_user_media_library_user").on(table.userId),
    index("idx_user_media_library_media").on(table.mediaId),
  ],
);

// ─── User Connections (Plex/Jellyfin) ───

export const userConnection = pgTable("user_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 20 }).notNull(), // 'plex', 'jellyfin', 'trakt'
  token: text("token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  externalUserId: varchar("external_user_id", { length: 255 }),
  accessibleLibraries: jsonb("accessible_libraries").$type<string[]>(),
  enabled: boolean("enabled").notNull().default(true),
  staleReason: varchar("stale_reason", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const traktListLink = pgTable(
  "trakt_list_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userConnectionId: uuid("user_connection_id")
      .notNull()
      .references(() => userConnection.id, { onDelete: "cascade" }),
    traktListId: integer("trakt_list_id").notNull(),
    traktListSlug: varchar("trakt_list_slug", { length: 255 }).notNull(),
    localListId: uuid("local_list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_trakt_list_link_connection_remote").on(
      table.userConnectionId,
      table.traktListId,
    ),
    uniqueIndex("idx_trakt_list_link_local").on(table.localListId),
    index("idx_trakt_list_link_connection").on(table.userConnectionId),
  ],
);

export const traktSyncState = pgTable(
  "trakt_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userConnectionId: uuid("user_connection_id")
      .notNull()
      .references(() => userConnection.id, { onDelete: "cascade" }),
    lastPulledAt: timestamp("last_pulled_at", { withTimezone: true }),
    lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_trakt_sync_state_connection").on(table.userConnectionId),
  ],
);

export const traktHistorySync = pgTable(
  "trakt_history_sync",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userConnectionId: uuid("user_connection_id")
      .notNull()
      .references(() => userConnection.id, { onDelete: "cascade" }),
    localHistoryId: uuid("local_history_id").references(() => userWatchHistory.id, {
      onDelete: "cascade",
    }),
    remoteHistoryId: bigint("remote_history_id", { mode: "number" }),
    syncedDirection: varchar("synced_direction", { length: 10 }).notNull(), // 'pull' | 'push'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_trakt_history_sync_local").on(
      table.userConnectionId,
      table.localHistoryId,
    ),
    uniqueIndex("idx_trakt_history_sync_remote").on(
      table.userConnectionId,
      table.remoteHistoryId,
    ),
    index("idx_trakt_history_sync_connection").on(table.userConnectionId),
  ],
);

// ─── User Media States (Watching, Completed, Rating) ───

export const userMediaState = pgTable(
  "user_media_state",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }), // none, planned, watching, completed, dropped
    rating: integer("rating"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaId] }),
    // Status-based filtering (planned/watching/completed) shows up in list
    // aggregation and profile views; the PK alone forces a scan of all the
    // user's rows for every status query.
    index("idx_user_media_state_user_status").on(table.userId, table.status),
  ],
);

// ─── User Hidden Media (externalId-based, works for any TMDB item) ───

export const userHiddenMedia = pgTable(
  "user_hidden_media",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    externalId: integer("external_id").notNull(),
    provider: varchar("provider", { length: 20 }).notNull().default("tmdb"),
    type: varchar("type", { length: 10 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    posterPath: varchar("poster_path", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.externalId, table.provider] })],
);

// ─── User Playback Progress ───

export const userPlaybackProgress = pgTable(
  "user_playback_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    positionSeconds: integer("position_seconds").notNull().default(0),
    isCompleted: boolean("is_completed").notNull().default(false),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }),
    source: varchar("source", { length: 20 }), // 'jellyfin', 'plex', 'trakt', 'manual'
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_user_playback_user").on(table.userId),
    index("idx_user_playback_media").on(table.mediaId),
    uniqueIndex("idx_user_playback_unique").on(
      table.userId,
      table.mediaId,
      table.episodeId,
    ),
    // Continue Watching hits this predicate on every tab open; the partial
    // index stays tiny (tombstones stay out) and the sort key matches the
    // ORDER BY lastWatchedAt DESC used by the feed query.
    index("idx_user_playback_active")
      .on(table.userId, sql`${table.lastWatchedAt} DESC`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ─── User Watch History ───

export const userWatchHistory = pgTable(
  "user_watch_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    watchedAt: timestamp("watched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: varchar("source", { length: 20 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_user_history_user").on(table.userId),
    index("idx_user_history_media").on(table.mediaId),
  ],
);

// ─── User Rating ───

export const userRating = pgTable(
  "user_rating",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").references(() => season.id, {
      onDelete: "cascade",
    }),
    episodeId: uuid("episode_id").references(() => episode.id, {
      onDelete: "cascade",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    isOverride: boolean("is_override").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_user_rating_user").on(table.userId),
    index("idx_user_rating_media").on(table.mediaId),
  ],
);

// ─── Relations ───

export const userRelations = relations(user, ({ many }) => ({
  // session and account each declare two `one(user, ...)` relations
  // (canonical + plural alias for better-auth's drizzle adapter), so the
  // inverse `many(...)` here must name the canonical one explicitly.
  sessions: many(session, { relationName: "session_user" }),
  accounts: many(account, { relationName: "account_user" }),
  preferences: many(userPreference),
  lists: many(list),
  listMemberships: many(listMember),
  downloadRequests: many(downloadRequest),
  recommendations: many(userRecommendation),
  connections: many(userConnection),
  mediaStates: many(userMediaState),
  hiddenMedia: many(userHiddenMedia),
  playbackProgress: many(userPlaybackProgress),
  watchHistory: many(userWatchHistory),
  ratings: many(userRating),
  homeSections: many(homeSection),
  profileSections: many(profileSection),
}));

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, {
    fields: [userPreference.userId],
    references: [user.id],
  }),
}));

export const homeSectionRelations = relations(homeSection, ({ one }) => ({
  user: one(user, {
    fields: [homeSection.userId],
    references: [user.id],
  }),
}));

export const profileSectionRelations = relations(profileSection, ({ one }) => ({
  user: one(user, {
    fields: [profileSection.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
    relationName: "session_user",
  }),
  // Plural alias consumed by better-auth's drizzle adapter when
  // `experimental.joins` is enabled. The adapter pluralizes the join key
  // (`{ user: true }` -> `with: { users: ... }`) regardless of `usePlural`,
  // so without this alias drizzle errors and findSession returns null.
  users: one(user, {
    fields: [session.userId],
    references: [user.id],
    relationName: "session_users",
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
    relationName: "account_user",
  }),
  users: one(user, {
    fields: [account.userId],
    references: [user.id],
    relationName: "account_users",
  }),
}));

export const downloadFolderRelations = relations(downloadFolder, ({ many, one }) => ({
  media: many(media),
  mediaPaths: many(folderMediaPath),
  downloadProfile: one(downloadProfile, {
    fields: [downloadFolder.downloadProfileId],
    references: [downloadProfile.id],
  }),
}));

export const folderMediaPathRelations = relations(folderMediaPath, ({ one }) => ({
  folder: one(downloadFolder, {
    fields: [folderMediaPath.folderId],
    references: [downloadFolder.id],
  }),
}));

export const folderServerLinkRelations = relations(folderServerLink, ({ one }) => ({
  userConnection: one(userConnection, {
    fields: [folderServerLink.userConnectionId],
    references: [userConnection.id],
  }),
}));


export const mediaRelations = relations(media, ({ many, one }) => ({
  library: one(downloadFolder, {
    fields: [media.libraryId],
    references: [downloadFolder.id],
  }),
  downloadProfile: one(downloadProfile, {
    fields: [media.downloadProfileId],
    references: [downloadProfile.id],
  }),
  seasons: many(season),
  files: many(mediaFile),
  versions: many(mediaVersion),
  credits: many(mediaCredit),
  videos: many(mediaVideo),
  watchProviders: many(mediaWatchProvider),
  recommendedBy: many(mediaRecommendation, { relationName: "recommendedMedia" }),
  recommendationsFor: many(mediaRecommendation, { relationName: "sourceMedia" }),
  listItems: many(listItem),
  translations: many(mediaTranslation),
  contentRatings: many(mediaContentRating),
  userStates: many(userMediaState),
  playbackProgress: many(userPlaybackProgress),
  watchHistory: many(userWatchHistory),
  ratings: many(userRating),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  media: one(media, {
    fields: [season.mediaId],
    references: [media.id],
  }),
  episodes: many(episode),
  translations: many(seasonTranslation),
  ratings: many(userRating),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  season: one(season, {
    fields: [episode.seasonId],
    references: [season.id],
  }),
  files: many(mediaFile),
  translations: many(episodeTranslation),
  playbackProgress: many(userPlaybackProgress),
  watchHistory: many(userWatchHistory),
  ratings: many(userRating),
}));

export const userRatingRelations = relations(userRating, ({ one }) => ({
  user: one(user, {
    fields: [userRating.userId],
    references: [user.id],
  }),
  media: one(media, {
    fields: [userRating.mediaId],
    references: [media.id],
  }),
  season: one(season, {
    fields: [userRating.seasonId],
    references: [season.id],
  }),
  episode: one(episode, {
    fields: [userRating.episodeId],
    references: [episode.id],
  }),
}));

export const mediaTranslationRelations = relations(mediaTranslation, ({ one }) => ({
  media: one(media, {
    fields: [mediaTranslation.mediaId],
    references: [media.id],
  }),
}));

export const mediaContentRatingRelations = relations(mediaContentRating, ({ one }) => ({
  media: one(media, {
    fields: [mediaContentRating.mediaId],
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

export const mediaVersionRelations = relations(mediaVersion, ({ one, many }) => ({
  media: one(media, {
    fields: [mediaVersion.mediaId],
    references: [media.id],
  }),
  serverLink: one(folderServerLink, {
    fields: [mediaVersion.serverLinkId],
    references: [folderServerLink.id],
  }),
  episodes: many(mediaVersionEpisode),
}));

export const mediaVersionEpisodeRelations = relations(mediaVersionEpisode, ({ one }) => ({
  version: one(mediaVersion, {
    fields: [mediaVersionEpisode.versionId],
    references: [mediaVersion.id],
  }),
}));

export const downloadProfileRelations = relations(downloadProfile, ({ many }) => ({
  media: many(media),
  folders: many(downloadFolder),
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
  members: many(listMember),
  invitations: many(listInvitation),
  traktLinks: many(traktListLink),
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

export const listMemberRelations = relations(listMember, ({ one }) => ({
  list: one(list, {
    fields: [listMember.listId],
    references: [list.id],
  }),
  user: one(user, {
    fields: [listMember.userId],
    references: [user.id],
  }),
}));

export const listInvitationRelations = relations(listInvitation, ({ one }) => ({
  list: one(list, {
    fields: [listInvitation.listId],
    references: [list.id],
  }),
  inviter: one(user, {
    fields: [listInvitation.invitedBy],
    references: [user.id],
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

export const userConnectionRelations = relations(userConnection, ({ one, many }) => ({
  user: one(user, {
    fields: [userConnection.userId],
    references: [user.id],
  }),
  traktListLinks: many(traktListLink),
  traktSyncStates: many(traktSyncState),
  traktHistorySync: many(traktHistorySync),
}));

export const traktListLinkRelations = relations(traktListLink, ({ one }) => ({
  userConnection: one(userConnection, {
    fields: [traktListLink.userConnectionId],
    references: [userConnection.id],
  }),
  localList: one(list, {
    fields: [traktListLink.localListId],
    references: [list.id],
  }),
}));

export const traktSyncStateRelations = relations(traktSyncState, ({ one }) => ({
  userConnection: one(userConnection, {
    fields: [traktSyncState.userConnectionId],
    references: [userConnection.id],
  }),
}));

export const traktHistorySyncRelations = relations(
  traktHistorySync,
  ({ one }) => ({
    userConnection: one(userConnection, {
      fields: [traktHistorySync.userConnectionId],
      references: [userConnection.id],
    }),
    localHistory: one(userWatchHistory, {
      fields: [traktHistorySync.localHistoryId],
      references: [userWatchHistory.id],
    }),
  }),
);

export const userMediaLibraryRelations = relations(userMediaLibrary, ({ one }) => ({
  user: one(user, {
    fields: [userMediaLibrary.userId],
    references: [user.id],
  }),
  media: one(media, {
    fields: [userMediaLibrary.mediaId],
    references: [media.id],
  }),
}));

export const userMediaStateRelations = relations(userMediaState, ({ one }) => ({
  user: one(user, {
    fields: [userMediaState.userId],
    references: [user.id],
  }),
  media: one(media, {
    fields: [userMediaState.mediaId],
    references: [media.id],
  }),
}));

export const userHiddenMediaRelations = relations(userHiddenMedia, ({ one }) => ({
  user: one(user, {
    fields: [userHiddenMedia.userId],
    references: [user.id],
  }),
}));

export const userPlaybackProgressRelations = relations(
  userPlaybackProgress,
  ({ one }) => ({
    user: one(user, {
      fields: [userPlaybackProgress.userId],
      references: [user.id],
    }),
    media: one(media, {
      fields: [userPlaybackProgress.mediaId],
      references: [media.id],
    }),
    episode: one(episode, {
      fields: [userPlaybackProgress.episodeId],
      references: [episode.id],
    }),
  }),
);

export const userWatchHistoryRelations = relations(
  userWatchHistory,
  ({ one }) => ({
    user: one(user, {
      fields: [userWatchHistory.userId],
      references: [user.id],
    }),
    media: one(media, {
      fields: [userWatchHistory.mediaId],
      references: [media.id],
    }),
    episode: one(episode, {
      fields: [userWatchHistory.episodeId],
      references: [episode.id],
    }),
  }),
);
